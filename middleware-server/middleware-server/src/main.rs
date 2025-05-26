use anyhow::{bail, Context as AnyhowContext, Result, anyhow};
use std::str::FromStr;

// Aptos SDK Imports
use aptos_sdk::{
    bcs,
    crypto::{ed25519::Ed25519PrivateKey, ValidCryptoMaterialStringExt},
    move_types::{identifier::Identifier, language_storage::ModuleId},
    rest_client::{aptos_api_types::{EntryFunctionId, ViewRequest}, Client as AptosClient},
    transaction_builder::TransactionFactory,
    types::{
        account_address::AccountAddress, chain_id::ChainId, transaction::{EntryFunction, TransactionPayload as AptosTransactionPayload}, LocalAccount
    },
};

// SpacetimeDB SDK v1.1.1 Imports
use spacetimedb_sdk::{
    credentials,
    DbContext,
    Event as SdbEvent,
    Identity,
    Table,
    TableWithPrimaryKey,
    __codegen::Reducer as SdbCodegenReducerTrait,
};

use std::{collections::{HashMap, HashSet}, sync::Arc, time::Duration};
use tokio::sync::Mutex;
use tokio::runtime::Handle as TokioRuntimeHandle;

pub mod module_bindings {
    // Assuming this path is correct relative to your main.rs or lib.rs
    // If main.rs is in src/, and module_bindings is in src/module_bindings/
    // then it would be include!("module_bindings/mod.rs");
    // If spacetime-agario is a sibling directory to middleware-server, then the path needs adjustment.
    include!("../../../spacetime-agario/middleman-server/src/module_bindings/mod.rs");
}

// Import specific table row structs for type annotations in callbacks
use module_bindings::{
    DbConnection,
    EventContext as ModuleEventContext,
    Player as SdbPlayer,
    Entity as SdbEntity,
    Circle as SdbCircle,
    RemoteTables,
    ErrorContext as ModuleErrorContext,
    SubscriptionEventContext as ModuleSubscriptionEventContext,
    player_table::PlayerTableAccess,
    circle_table::CircleTableAccess,
    entity_table::EntityTableAccess,
};

use log::{error, warn, info};
use serde_json::json;

const PINK_SKIN_MASS_THRESHOLD: u32 = 50;
const RAINBOW_SKIN_MASS_THRESHOLD: u32 = 100;
const SPACETIMEDB_HOST: &str = "ws://localhost:3000";
const SPACETIMEDB_DB_NAME: &str = "spacetime-agario";
const SPACETIMEDB_CREDS_DIR_NAME: &str = "spacetime-agario";

const APTOS_TX_MAX_RETRIES: u32 = 3;
const APTOS_TX_RETRY_DELAY: Duration = Duration::from_secs(5);


#[derive(Debug)]
struct AptosConfig { node_url: String, admin_private_key_hex: String, admin_address_hex: String, skin_module_account_address_hex: String, skin_module_name: String, }

struct AptosContext {
    client: Arc<AptosClient>,
    admin_address: AccountAddress,
    admin_private_key: Ed25519PrivateKey,
    skin_module_id: ModuleId,
    transaction_factory: TransactionFactory,
    granted_skins_cache: Arc<Mutex<HashMap<AccountAddress, HashSet<String>>>>,
    pending_grants: Arc<Mutex<HashSet<(AccountAddress, SkinType)>>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum SkinType { Pink, Rainbow }

impl SkinType {
    fn grant_function_name(&self) -> &'static str { match self { SkinType::Pink => "grant_pink_skin", SkinType::Rainbow => "grant_rainbow_skin", } }
    fn has_function_name(&self) -> &'static str { match self { SkinType::Pink => "has_pink_skin", SkinType::Rainbow => "has_rainbow_skin", } }
    fn to_cache_key(&self) -> String { match self { SkinType::Pink => "pink".to_string(), SkinType::Rainbow => "rainbow".to_string(), } }
}
fn creds_store() -> credentials::File { credentials::File::new(SPACETIMEDB_CREDS_DIR_NAME) }

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    info!("Application starting. env_logger initialized.");

    dotenvy::dotenv().ok();
    info!("dotenv loaded (if .env file exists).");

    let runtime_handle = TokioRuntimeHandle::current();
    info!("Tokio runtime handle acquired.");

    info!("Loading Aptos config from environment variables...");
    let aptos_config = load_aptos_config_from_env()?;
    info!("Aptos config loaded: Node URL: {}", aptos_config.node_url);

    info!("Setting up Aptos context...");
    let aptos_context = Arc::new(setup_aptos_context(&aptos_config).await?);
    info!("Aptos context setup complete.");

    info!("Attempting to connect to SpacetimeDB at {} (DB Name: {})...", SPACETIMEDB_HOST, SPACETIMEDB_DB_NAME);
    let token_opt: Option<String> = creds_store().load().ok().flatten();
    if token_opt.is_some() {
        info!("SpacetimeDB token found and loaded.");
    } else {
        info!("No SpacetimeDB token found in creds store.");
    }

    info!("Building SpacetimeDB connection object...");
    let sdb_connection = DbConnection::builder()
        .with_uri(SPACETIMEDB_HOST)
        .with_module_name(SPACETIMEDB_DB_NAME)
        .with_token(token_opt)
        .on_connect(on_sdb_connected)
        .on_connect_error(on_sdb_connect_error)
        .on_disconnect(on_sdb_disconnected)
        .build()
        .context("Failed to build SpacetimeDB connection object")?;
    info!("SpacetimeDB connection object built.");

    info!("Registering player callbacks with SpacetimeDB...");
    register_player_callbacks(&sdb_connection, aptos_context.clone(), runtime_handle.clone());
    info!("Player callbacks registered.");

    info!("Registering entity callbacks with SpacetimeDB...");
    register_entity_callbacks(&sdb_connection, aptos_context.clone(), runtime_handle.clone());
    info!("Entity callbacks registered.");

    info!("Registering circle callbacks with SpacetimeDB...");
    register_circle_callbacks(&sdb_connection, aptos_context.clone(), runtime_handle.clone());
    info!("Circle callbacks registered.");


    info!("Subscribing to SpacetimeDB game tables...");
    subscribe_to_game_tables(&sdb_connection);
    info!("Subscription request to game tables sent.");

    info!("SpacetimeDB setup complete. Running event loop (this will block until SDB thread exits)...");
    sdb_connection.run_threaded().join().expect("SpacetimeDB thread panicked");

    info!("SpacetimeDB thread has finished. Main function is exiting.");
    Ok(())
}


fn on_sdb_connected(_ctx: &DbConnection, identity: Identity, token: &str) {
    info!("Successfully connected to SpacetimeDB. Identity: {:?}. Token received (len: {}).", identity, token.len());
}
fn on_sdb_connect_error(_ctx: &ModuleErrorContext, err: spacetimedb_sdk::Error) {
    error!("SpacetimeDB connection error: {:?}. Exiting.", err);
    std::process::exit(1);
}
fn on_sdb_disconnected(_ctx: &ModuleErrorContext, err: Option<spacetimedb_sdk::Error>) {
    if let Some(ref e) = err {
        error!("Disconnected from SpacetimeDB due to error: {:?}. Exiting.", e);
    } else {
        info!("Disconnected from SpacetimeDB normally. Exiting.");
    }
    std::process::exit(if err.is_some() { 1 } else { 0 });
}

fn register_player_callbacks(
    sdb_conn: &DbConnection,
    aptos_ctx: Arc<AptosContext>,
    runtime_handle: TokioRuntimeHandle,
) {
    let aptos_ctx_insert = aptos_ctx.clone();
    let runtime_handle_insert = runtime_handle.clone();
    sdb_conn.db.player().on_insert(move |ctx: &ModuleEventContext, player_row: &SdbPlayer| {
        info!("[SDB Player Insert] Player: {}, Aptos Addr: {}, ID: {}", player_row.name, player_row.aptos_address, player_row.player_id);
        match &ctx.event {
            SdbEvent::Reducer(reducer_event) => {
                info!("[SDB Player Insert] Caused by Reducer: {:?}, Status: {:?}", SdbCodegenReducerTrait::reducer_name(&reducer_event.reducer), reducer_event.status);
            }
            SdbEvent::SubscribeApplied => {
                info!("[SDB Player Insert] Occurred due to SubscribeApplied event.");
            }
            _ => {
                warn!("[SDB Player Insert] Player insert from other event type: {:?}", ctx.event);
            }
        }
        process_player_state_change(player_row, &ctx.db(), aptos_ctx_insert.clone(), runtime_handle_insert.clone());
    });

    let aptos_ctx_update = aptos_ctx.clone();
    let runtime_handle_update = runtime_handle.clone();
    sdb_conn.db.player().on_update(move |ctx: &ModuleEventContext, _old_player: &SdbPlayer, new_player: &SdbPlayer| {
        info!("[SDB Player Update] Player: {}, Aptos Addr: {}, ID: {}", new_player.name, new_player.aptos_address, new_player.player_id);
        match &ctx.event {
            SdbEvent::Reducer(reducer_event) => {
                info!("[SDB Player Update] Caused by Reducer: {:?}, Status: {:?}", SdbCodegenReducerTrait::reducer_name(&reducer_event.reducer), reducer_event.status);
            }
             _ => {
                warn!("[SDB Player Update] Player update from other event type: {:?}", ctx.event);
            }
        }
        process_player_state_change(new_player, &ctx.db(), aptos_ctx_update.clone(), runtime_handle_update.clone());
    });
}

fn register_entity_callbacks(
    sdb_conn: &DbConnection,
    aptos_ctx: Arc<AptosContext>,
    runtime_handle: TokioRuntimeHandle,
) {
    let aptos_ctx_entity_update = aptos_ctx.clone();
    let runtime_handle_entity_update = runtime_handle.clone();
    sdb_conn.db.entity().on_update(move |ctx: &ModuleEventContext, old_entity: &SdbEntity, new_entity: &SdbEntity| {
        if old_entity.mass == new_entity.mass {
            return;
        }
        info!("[SDB Entity Update] Entity ID: {} mass changed from {} to {}. Checking player.", new_entity.entity_id, old_entity.mass, new_entity.mass);
        if let Some(player_id) = ctx.db().circle().iter().find(|c| c.entity_id == new_entity.entity_id).map(|circle| circle.player_id) {
            if let Some(player_row) = ctx.db().player().iter().find(|p| p.player_id == player_id) {
                info!("[SDB Entity Update] Entity {} belongs to Player ID {}. Processing state change.", new_entity.entity_id, player_id);
                process_player_state_change(&player_row, &ctx.db(), aptos_ctx_entity_update.clone(), runtime_handle_entity_update.clone());
            } else {
                warn!("[SDB Entity Update] Entity {} associated with player_id {} but player row not found.", new_entity.entity_id, player_id);
            }
        }
    });
}

fn register_circle_callbacks(
    sdb_conn: &DbConnection,
    aptos_ctx: Arc<AptosContext>,
    runtime_handle: TokioRuntimeHandle,
) {
    let aptos_ctx_c_insert = aptos_ctx.clone();
    let runtime_handle_c_insert = runtime_handle.clone();
    sdb_conn.db.circle().on_insert(move |ctx: &ModuleEventContext, new_circle: &SdbCircle| {
        info!("[SDB Circle Insert] New circle for Entity ID: {} linked to Player ID: {}. Re-evaluating player mass.", new_circle.entity_id, new_circle.player_id);
        if let Some(player_row) = ctx.db().player().iter().find(|p| p.player_id == new_circle.player_id) {
            process_player_state_change(&player_row, &ctx.db(), aptos_ctx_c_insert.clone(), runtime_handle_c_insert.clone());
        } else {
            warn!("[SDB Circle Insert] Circle for Player ID {} inserted, but Player row not found.", new_circle.player_id);
        }
    });

    let aptos_ctx_c_delete = aptos_ctx.clone();
    let runtime_handle_c_delete = runtime_handle.clone();
    sdb_conn.db.circle().on_delete(move |ctx: &ModuleEventContext, deleted_circle: &SdbCircle| {
        info!("[SDB Circle Delete] Circle for Entity ID: {} (Player ID: {}) was deleted. Re-evaluating player mass.", deleted_circle.entity_id, deleted_circle.player_id);
        if let Some(player_row) = ctx.db().player().iter().find(|p| p.player_id == deleted_circle.player_id) {
             process_player_state_change(&player_row, &ctx.db(), aptos_ctx_c_delete.clone(), runtime_handle_c_delete.clone());
        } else {
            info!("[SDB Circle Delete] Circle for Player ID {} deleted, but Player row not found (player might have disconnected/been deleted).", deleted_circle.player_id);
        }
    });
}

fn process_player_state_change(
    player_row: &SdbPlayer,
    db_view: &RemoteTables,
    aptos_ctx: Arc<AptosContext>,
    runtime_handle: TokioRuntimeHandle,
) {
    info!("[ProcessPlayerStateChange] Called for Player ID: {}, Name: '{}', Aptos Addr: '{}'", player_row.player_id, player_row.name, player_row.aptos_address);

    let current_total_mass = calculate_player_total_mass(player_row.player_id, db_view);
    let p_id = player_row.player_id;
    let p_aptos_address = player_row.aptos_address.clone();

    runtime_handle.spawn(async move {
        info!("[TokioSpawn in ProcessPlayerStateChange] Task started for Player ID: {}. Mass: {}. Aptos Addr: '{}'", p_id, current_total_mass, p_aptos_address);

        if current_total_mass >= RAINBOW_SKIN_MASS_THRESHOLD {
            info!("[TokioSpawn] Player ID: {} Mass {} >= RAINBOW_SKIN_MASS_THRESHOLD ({}). Attempting Rainbow skin.", p_id, current_total_mass, RAINBOW_SKIN_MASS_THRESHOLD);
            if let Err(e) = check_and_grant_skin(aptos_ctx.clone(), &p_aptos_address, SkinType::Rainbow).await {
                error!("[TokioSpawn] Error processing Rainbow skin for Player ID: {}, Addr: {}: {:?}", p_id, p_aptos_address, e);
            } else {
                info!("[TokioSpawn] Successfully processed Rainbow skin check/grant for Player ID: {}", p_id);
            }
        } else if current_total_mass >= PINK_SKIN_MASS_THRESHOLD {
            info!("[TokioSpawn] Player ID: {} Mass {} >= PINK_SKIN_MASS_THRESHOLD ({}). Attempting Pink skin.", p_id, current_total_mass, PINK_SKIN_MASS_THRESHOLD);
            if let Err(e) = check_and_grant_skin(aptos_ctx.clone(), &p_aptos_address, SkinType::Pink).await {
                error!("[TokioSpawn] Error processing Pink skin for Player ID: {}, Addr: {}: {:?}", p_id, p_aptos_address, e);
            } else {
                info!("[TokioSpawn] Successfully processed Pink skin check/grant for Player ID: {}", p_id);
            }
        } else {
            info!("[TokioSpawn] Player ID: {} Mass {} did not meet any skin threshold (Pink: {}, Rainbow: {}).", p_id, current_total_mass, PINK_SKIN_MASS_THRESHOLD, RAINBOW_SKIN_MASS_THRESHOLD);
        }
    });
}


fn subscribe_to_game_tables(sdb_conn: &DbConnection) {
    let queries = vec![
        "SELECT * FROM player".to_string(),
        "SELECT * FROM circle".to_string(),
        "SELECT * FROM entity".to_string(),
    ];
    sdb_conn.subscription_builder().on_applied(on_subscription_applied).on_error(on_subscription_error).subscribe(queries);
    info!("Subscription request for player, circle, and entity tables sent.");
}

fn on_subscription_applied(_ctx: &ModuleSubscriptionEventContext) { info!("Game table subscriptions applied successfully."); }
fn on_subscription_error(_ctx: &ModuleErrorContext, err: spacetimedb_sdk::Error) { error!("Failed to apply game table subscriptions: {:?}", err); }

fn calculate_player_total_mass(player_id_to_find: u32, db_view: &RemoteTables) -> u32 {
    let mut total_mass = 0;
    let mut circles_found = 0;
    for sdb_circle_row in db_view.circle().iter().filter(|c| c.player_id == player_id_to_find) {
        circles_found += 1;
        if let Some(sdb_entity_row) = db_view.entity().iter().find(|e| e.entity_id == sdb_circle_row.entity_id) {
            total_mass += sdb_entity_row.mass;
        } else {
            warn!("[CalculateMass] Player ID {}: Entity NOT FOUND for Circle Entity ID: {} (belongs to player_id: {})", player_id_to_find, sdb_circle_row.entity_id, player_id_to_find);
        }
    }
    if circles_found == 0 && player_id_to_find != 0 {
        info!("[CalculateMass] Player ID {}: No circles found in db_view.", player_id_to_find);
    }
    info!("[CalculateMass] Player ID {}: Calculated total mass = {}", player_id_to_find, total_mass);
    total_mass
}

async fn check_and_grant_skin(
    aptos_ctx: Arc<AptosContext>,
    player_aptos_address_str: &str,
    skin_type: SkinType,
) -> Result<()> {
    info!("[CheckAndGrantSkin] Player Addr: '{}', Skin Type: {:?}", player_aptos_address_str, skin_type.to_cache_key());
    if player_aptos_address_str.trim().is_empty() || player_aptos_address_str == "0x0" || !player_aptos_address_str.starts_with("0x") {
        warn!("[CheckAndGrantSkin] Skipping skin grant for invalid or empty Aptos address: '{}'", player_aptos_address_str);
        return Ok(());
    }
    let recipient_address = AccountAddress::from_str(player_aptos_address_str)
        .with_context(|| format!("[CheckAndGrantSkin] Invalid Aptos address string: {}", player_aptos_address_str))?;

    let grant_key = (recipient_address, skin_type);

    // Check local cache to see if skin has already been granted to user
    { 
        let cache = aptos_ctx.granted_skins_cache.lock().await;
        if cache.get(&recipient_address).map_or(false, |skins| skins.contains(&skin_type.to_cache_key())) {
            info!("[CheckAndGrantSkin] Skin {:?} already in granted_skins_cache for {}. Skipping.", skin_type, recipient_address);
            return Ok(());
        }
    }

    {
        let mut pending = aptos_ctx.pending_grants.lock().await;
        if pending.contains(&grant_key) {
            info!("[CheckAndGrantSkin] Skin grant for {:?} to {} is already in progress (in pending_grants). Skipping.", skin_type, recipient_address);
            return Ok(());
        }
        pending.insert(grant_key);
        info!("[CheckAndGrantSkin] Added {:?} for {} to pending_grants.", skin_type, recipient_address);
    }

    let result = async {
        let contract_addr_val = aptos_ctx.skin_module_id.address();
        let module_name_str = aptos_ctx.skin_module_id.name().to_string();
        let module_identifier = Identifier::new(module_name_str.clone())
            .map_err(|e| anyhow!("[CheckAndGrantSkin] Failed to create identifier from module name '{}': {}", module_name_str, e))?;

        info!("[CheckAndGrantSkin] Checking on-chain if {} has {:?} skin...", recipient_address, skin_type);
        match has_skin_on_aptos(&aptos_ctx.client, *contract_addr_val, &module_identifier, skin_type.has_function_name(), recipient_address).await {
            Ok(has_skin) => {
                if has_skin {
                    info!("[CheckAndGrantSkin] Player {} already has {:?} skin (on-chain). Updating local cache.", recipient_address, skin_type);
                    let mut cache = aptos_ctx.granted_skins_cache.lock().await;
                    cache.entry(recipient_address).or_default().insert(skin_type.to_cache_key());
                    return Ok(());
                }
                info!("[CheckAndGrantSkin] Player {} does not have {:?} skin (on-chain). Proceeding to grant.", recipient_address, skin_type);
            }
            Err(e) => {
                return Err(e.context(format!("[CheckAndGrantSkin] Failed to check if {} has {:?} skin", recipient_address, skin_type)));
            }
        }

        info!("[CheckAndGrantSkin] Attempting to grant {:?} skin to player {} on-chain...", skin_type, recipient_address);
        grant_skin_on_aptos_with_retries(
            &aptos_ctx,
            skin_type.grant_function_name(),
            recipient_address,
            
        ).await.with_context(|| format!("[CheckAndGrantSkin] Failed to grant {:?} skin to {}", skin_type, recipient_address))?;

        info!("[CheckAndGrantSkin] Successfully granted {:?} skin to player {}. Updating local cache.", skin_type, recipient_address);
        let mut cache = aptos_ctx.granted_skins_cache.lock().await;
        cache.entry(recipient_address).or_default().insert(skin_type.to_cache_key());
        Ok(())
    }.await;

    {
        let mut pending = aptos_ctx.pending_grants.lock().await;
        pending.remove(&grant_key);
        info!("[CheckAndGrantSkin] Removed {:?} for {} from pending_grants after attempt. Result: {}", grant_key.1, grant_key.0, if result.is_ok() {"Ok"} else {"Err"});
    }

    result
}


async fn has_skin_on_aptos(client: &AptosClient, contract_address: AccountAddress, module_name: &Identifier, function_name: &str, user_address: AccountAddress) -> Result<bool> {
    let ident = Identifier::new(function_name.to_string()).map_err(|e_str| anyhow!("[HasSkinOnAptos] Invalid identifier string '{}': {}", function_name, e_str))?;
    let user_address_hex_string = user_address.to_hex_literal();
    let request = ViewRequest {
        function: EntryFunctionId{
            module: ModuleId::new(contract_address, module_name.clone()).into(),
            name: aptos_sdk::rest_client::aptos_api_types::IdentifierWrapper::from(ident),
        },
        type_arguments: vec![],
        arguments: vec![json!(user_address_hex_string)],
    };

    let res = client.view(&request, None).await.context(format!("[HasSkinOnAptos] Aptos view call failed for function {}", function_name))?;
    let json_value = res.into_inner().get(0).cloned().context(format!("[HasSkinOnAptos] View function {} returned no values", function_name))?;
    let has_skin_val: bool = serde_json::from_value(json_value.clone()).context(format!("[HasSkinOnAptos] Failed to parse boolean from view response for {}: {:?}", function_name, json_value))?;
    Ok(has_skin_val)
}

async fn grant_skin_on_aptos_with_retries(
    aptos_ctx: &Arc<AptosContext>,
    function_name: &str,
    recipient_address: AccountAddress,
) -> Result<()> {
    let ident = Identifier::new(function_name.to_string()).map_err(|e_str| anyhow!("[GrantSkinWithRetries] Invalid identifier string '{}': {}", function_name, e_str))?;
    let entry_payload = EntryFunction::new(aptos_ctx.skin_module_id.clone(), ident, vec![], vec![bcs::to_bytes(&recipient_address)?]);
    let base_txn_payload = AptosTransactionPayload::EntryFunction(entry_payload);

    let sequence_number = match aptos_ctx.client.get_account(aptos_ctx.admin_address).await {
        Ok(res) => res.inner().sequence_number,
        Err(e) => {
            return Err(anyhow!(e).context("Failed to get admin sequence number after max retries"));
        }
    };

    let admin_account_for_attempt = LocalAccount::from_private_key(&(aptos_ctx.admin_private_key.to_encoded_string().unwrap()), sequence_number).unwrap();

    for attempt in 0..APTOS_TX_MAX_RETRIES {
        info!("[GrantSkinWithRetries Attempt {}/{}] Granting skin to {} via module {} function {}", attempt + 1, APTOS_TX_MAX_RETRIES, recipient_address, aptos_ctx.skin_module_id, function_name);

        let current_sequence_number = match aptos_ctx.client.get_account(aptos_ctx.admin_address).await {
            Ok(res) => res.inner().sequence_number,
            Err(e) => {
                error!("[GrantSkinWithRetries Attempt {}] Failed to get admin account info for sequence number: {:?}", attempt + 1, e);
                if attempt == APTOS_TX_MAX_RETRIES - 1 {
                    // Convert RestError to anyhow::Error before calling context
                    return Err(anyhow!(e).context("Failed to get admin sequence number after max retries"));
                }
                tokio::time::sleep(APTOS_TX_RETRY_DELAY).await;
                continue;
            }
        };
        info!("[GrantSkinWithRetries Attempt {}] Admin account sequence number for this attempt: {}", attempt + 1, current_sequence_number);

        admin_account_for_attempt.set_sequence_number(sequence_number);
        
        let signed_txn = admin_account_for_attempt.sign_with_transaction_builder(
            aptos_ctx.transaction_factory.payload(base_txn_payload.clone())
        );

        info!("[GrantSkinWithRetries Attempt {}] Transaction signed. Submitting and waiting...", attempt + 1);
        match aptos_ctx.client.submit_and_wait(&signed_txn).await {
            Ok(pending_txn_response) => {
                let transaction_response_inner = pending_txn_response.inner();
                match transaction_response_inner {
                    aptos_sdk::rest_client::Transaction::UserTransaction(user_txn_data_box) => {
                        let txn_info = &user_txn_data_box.info;
                        if txn_info.success {
                            info!("[GrantSkinWithRetries Attempt {}] Grant skin transaction successful. Hash: {:?}", attempt + 1, txn_info.hash);
                            return Ok(());
                        } else {
                            error!(
                                "[GrantSkinWithRetries Attempt {}] Grant skin transaction FAILED on chain. Hash: {:?}, VM Status: {}, Full info: {:?}",
                                attempt + 1, txn_info.hash, txn_info.vm_status, user_txn_data_box
                            );
                            if attempt == APTOS_TX_MAX_RETRIES - 1 {
                                bail!("[GrantSkinWithRetries] Grant skin transaction failed after {} retries. Last VM Status: {}.", APTOS_TX_MAX_RETRIES, txn_info.vm_status);
                            }
                        }
                    }
                    _ => {
                        error!("[GrantSkinWithRetries Attempt {}] Submitted transaction was not a UserTransaction: {:?}", attempt + 1, transaction_response_inner);
                        if attempt == APTOS_TX_MAX_RETRIES - 1 {
                            bail!("[GrantSkinWithRetries] Submitted transaction was not a UserTransaction after {} retries.", APTOS_TX_MAX_RETRIES);
                        }
                    }
                }
            }
            Err(e) => { // e is RestError
                error!("[GrantSkinWithRetries Attempt {}] Failed to submit and wait for transaction: {:?}", attempt + 1, e);
                if attempt == APTOS_TX_MAX_RETRIES - 1 {
                    // Convert RestError e to anyhow::Error before calling context
                    return Err(anyhow!(e).context(format!("[GrantSkinWithRetries] Failed after {} retries during submit/wait", APTOS_TX_MAX_RETRIES)));
                }
            }
        }
        info!("[GrantSkinWithRetries Attempt {}] Waiting for {:?} before retrying...", attempt + 1, APTOS_TX_RETRY_DELAY);
        tokio::time::sleep(APTOS_TX_RETRY_DELAY).await;
    }
    bail!("[GrantSkinWithRetries] Exhausted all {} retries for granting skin to {}.", APTOS_TX_MAX_RETRIES, recipient_address);
}


fn load_aptos_config_from_env() -> Result<AptosConfig> {
    info!("[LoadAptosConfig] Loading environment variables...");
    let config = AptosConfig {
        node_url: std::env::var("APTOS_NODE_URL").context("APTOS_NODE_URL not set")?,
        admin_private_key_hex: std::env::var("CONTRACT_ADMIN_PRIVATE_KEY").context("CONTRACT_ADMIN_PRIVATE_KEY not set")?,
        admin_address_hex: std::env::var("CONTRACT_ADMIN_ADDRESS").context("CONTRACT_ADMIN_ADDRESS not set")?,
        skin_module_account_address_hex: std::env::var("PLAYER_SKIN_MODULE_ACCOUNT_ADDRESS").context("PLAYER_SKIN_MODULE_ACCOUNT_ADDRESS not set")?,
        skin_module_name: std::env::var("PLAYER_SKIN_MODULE_NAME").context("PLAYER_SKIN_MODULE_NAME not set")?,
    };
    info!("[LoadAptosConfig] APTOS_NODE_URL: {}", config.node_url);
    Ok(config)
}

async fn setup_aptos_context(config: &AptosConfig) -> Result<AptosContext> {
    info!("[AptosContextSetup] Starting. Node URL: {}", config.node_url);
    let client = Arc::new(AptosClient::new(config.node_url.parse().context(format!("[AptosContextSetup] Failed to parse Aptos Node URL: {}", config.node_url))?));
    info!("[AptosContextSetup] AptosClient created.");

    let private_key_bytes = hex::decode(&config.admin_private_key_hex).context("[AptosContextSetup] Failed to decode admin private key from hex")?;
    let admin_private_key = Ed25519PrivateKey::try_from(private_key_bytes.as_slice()).context("[AptosContextSetup] Failed to create Ed25519PrivateKey from bytes")?;
    let admin_address = AccountAddress::from_str(&config.admin_address_hex).context(format!("[AptosContextSetup] Failed to parse admin address from hex: {}", config.admin_address_hex))?;
    info!("[AptosContextSetup] Admin address parsed: {}", admin_address);

    let skin_module_account_address = AccountAddress::from_str(&config.skin_module_account_address_hex).context(format!("[AptosContextSetup] Failed to parse skin module account address: {}", config.skin_module_account_address_hex))?;
    let skin_module_name_identifier = Identifier::new(config.skin_module_name.clone()).map_err(|e_str| anyhow!("[AptosContextSetup] Invalid identifier for skin module name '{}': {}", config.skin_module_name, e_str))?;
    let skin_module_id = ModuleId::new(skin_module_account_address, skin_module_name_identifier);
    info!("[AptosContextSetup] Skin module ID created: {}", skin_module_id);

    info!("[AptosContextSetup] Getting ledger information for chain ID from node...");
    let ledger_info_response = client.get_ledger_information().await.context("[AptosContextSetup] Failed to get ledger information from Aptos node")?;
    let chain_id_val = ledger_info_response.inner().chain_id;
    info!("[AptosContextSetup] Chain ID: {}", chain_id_val);

    let transaction_factory = TransactionFactory::new(ChainId::new(chain_id_val))
        .with_gas_unit_price(100)
        .with_max_gas_amount(600_000);
    info!("[AptosContextSetup] Transaction factory created.");

    info!("[AptosContextSetup] Setup finished successfully.");
    Ok(AptosContext {
        client,
        admin_address,
        admin_private_key,
        skin_module_id,
        transaction_factory,
        granted_skins_cache: Arc::new(Mutex::new(HashMap::new())),
        pending_grants: Arc::new(Mutex::new(HashSet::new())),
    })
}