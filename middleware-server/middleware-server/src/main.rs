use anyhow::{bail, Context as AnyhowContext, Result};
use std::str::FromStr;

// Aptos SDK Imports
use aptos_sdk::{
    bcs,
    crypto::ed25519::Ed25519PrivateKey,
    move_types::{identifier::Identifier, language_storage::ModuleId},
    rest_client::{aptos_api_types::{EntryFunctionId, ViewRequest, UserTransaction as AptosUserTransaction}, Client as AptosClient}, // Removed unused TransactionOnChainData
    transaction_builder::TransactionFactory,
    types::{
        account_address::AccountAddress, chain_id::ChainId, transaction::{EntryFunction, TransactionPayload as AptosTransactionPayload, SignedTransaction}, LocalAccount
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

use std::{collections::{HashMap, HashSet}, sync::Arc};
use tokio::sync::Mutex;
use tokio::runtime::Handle as TokioRuntimeHandle;

pub mod module_bindings {
    include!("../../../spacetime-agario/middleman-server/src/module_bindings/mod.rs");
}

// Import specific table row structs for type annotations in callbacks
use module_bindings::{
    DbConnection,
    EventContext as ModuleEventContext,
    Player as SdbPlayer,
    Entity as SdbEntity, // Added for Entity callbacks
    Circle as SdbCircle, // Added for Circle callbacks
    RemoteTables,
    ErrorContext as ModuleErrorContext,
    SubscriptionEventContext as ModuleSubscriptionEventContext,
    player_table::PlayerTableAccess,
    circle_table::CircleTableAccess,
    entity_table::EntityTableAccess,
};

use log::{error, warn, info};

const PINK_SKIN_MASS_THRESHOLD: u32 = 50;
const RAINBOW_SKIN_MASS_THRESHOLD: u32 = 500;
const SPACETIMEDB_HOST: &str = "ws://localhost:3000";
const SPACETIMEDB_DB_NAME: &str = "spacetime-agario";
const SPACETIMEDB_CREDS_DIR_NAME: &str = "spacetime-agario";

#[derive(Debug)]
struct AptosConfig { node_url: String, admin_private_key_hex: String, admin_address_hex: String, skin_module_account_address_hex: String, skin_module_name: String, }
struct AptosContext { client: Arc<AptosClient>, admin_account: Arc<LocalAccount>, skin_module_id: ModuleId, transaction_factory: TransactionFactory, granted_skins_cache: Arc<Mutex<HashMap<AccountAddress, HashSet<String>>>>, }
#[derive(Debug, Clone, Copy)]
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

    // Register callbacks for Entity and Circle tables
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
            _ => { // Other event types like UnknownTransaction are logged as a warning if they cause player insert
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
        // Only process if aptos_address changes, as other direct Player fields don't affect skin eligibility
        // if old_player.aptos_address != new_player.aptos_address || old_player.name != new_player.name {
        //    process_player_state_change(new_player, &ctx.db(), aptos_ctx_update.clone(), runtime_handle_update.clone());
        // }
        // For now, let's assume any Player update might be relevant, or rely on Entity/Circle updates for mass.
        // If name/aptos_address changes, it's good to log, but mass check might be redundant if not also triggered by entity/circle.
        // Let's keep it simple: if player row updates, check. This is infrequent.
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
            return; // No mass change, no need to re-evaluate for skin
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
        // If entity is not part of a circle (e.g. food), no action needed for player skins.
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
    // This log was already here, good.
    // info!("[ProcessPlayerStateChange] Player ID: {} calculated total mass: {}", player_row.player_id, current_total_mass);

    let p_id = player_row.player_id;
    let p_aptos_address = player_row.aptos_address.clone();

    runtime_handle.spawn(async move {
        info!("[TokioSpawn in ProcessPlayerStateChange] Task started for Player ID: {}. Mass: {}. Aptos Addr: '{}'", p_id, current_total_mass, p_aptos_address);

        if current_total_mass >= RAINBOW_SKIN_MASS_THRESHOLD {
            info!("[TokioSpawn] Player ID: {} Mass {} >= RAINBOW_SKIN_MASS_THRESHOLD ({}). Attempting Rainbow skin.", p_id, current_total_mass, RAINBOW_SKIN_MASS_THRESHOLD);
            if let Err(e) = check_and_grant_skin(aptos_ctx.clone(), &p_aptos_address, SkinType::Rainbow).await {
                error!("[TokioSpawn] Error granting Rainbow skin for Player ID: {}, Addr: {}: {:?}", p_id, p_aptos_address, e);
            } else {
                info!("[TokioSpawn] Successfully processed Rainbow skin check for Player ID: {}", p_id);
            }
        } else if current_total_mass >= PINK_SKIN_MASS_THRESHOLD {
            info!("[TokioSpawn] Player ID: {} Mass {} >= PINK_SKIN_MASS_THRESHOLD ({}). Attempting Pink skin.", p_id, current_total_mass, PINK_SKIN_MASS_THRESHOLD);
            if let Err(e) = check_and_grant_skin(aptos_ctx.clone(), &p_aptos_address, SkinType::Pink).await {
                error!("[TokioSpawn] Error granting Pink skin for Player ID: {}, Addr: {}: {:?}", p_id, p_aptos_address, e);
            } else {
                info!("[TokioSpawn] Successfully processed Pink skin check for Player ID: {}", p_id);
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
    // Reduced verbosity of this function for cleaner logs, but kept key info
    // info!("[CalculateMass] Calculating total mass for Player ID: {}", player_id_to_find);
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
    if circles_found == 0 && player_id_to_find != 0 { // Avoid logging for uninitialized player if ID is 0 or some default
        info!("[CalculateMass] Player ID {}: No circles found in db_view.", player_id_to_find);
    }
    info!("[CalculateMass] Player ID {}: Calculated total mass = {}", player_id_to_find, total_mass);
    total_mass
}

async fn check_and_grant_skin(aptos_ctx: Arc<AptosContext>, player_aptos_address_str: &str, skin_type: SkinType) -> Result<()> {
    info!("[CheckAndGrantSkin] Player Addr: '{}', Skin Type: {:?}", player_aptos_address_str, skin_type.to_cache_key());
    if player_aptos_address_str.trim().is_empty() || player_aptos_address_str == "0x0" || !player_aptos_address_str.starts_with("0x") {
        warn!("[CheckAndGrantSkin] Skipping skin grant for invalid or empty Aptos address: '{}'", player_aptos_address_str);
        return Ok(());
    }
    let recipient_address = AccountAddress::from_str(player_aptos_address_str).with_context(|| format!("[CheckAndGrantSkin] Invalid Aptos address string: {}", player_aptos_address_str))?;

    {
        let cache = aptos_ctx.granted_skins_cache.lock().await;
        if let Some(granted_set) = cache.get(&recipient_address) {
            if granted_set.contains(&skin_type.to_cache_key()) {
                info!("[CheckAndGrantSkin] Skin {:?} already known to be granted to {} (cache hit). Skipping.", skin_type, recipient_address);
                return Ok(());
            }
        }
    }

    let contract_addr_val = aptos_ctx.skin_module_id.address();
    let module_name_str = aptos_ctx.skin_module_id.name().to_string();
    let module_identifier = Identifier::new(module_name_str.clone()).map_err(|e| anyhow::anyhow!("[CheckAndGrantSkin] Failed to create identifier from module name '{}': {}", module_name_str, e))?;

    info!("[CheckAndGrantSkin] Checking on-chain if {} has {:?} skin...", recipient_address, skin_type);
    let has_skin = has_skin_on_aptos(&aptos_ctx.client, *contract_addr_val, &module_identifier, skin_type.has_function_name(), recipient_address).await.with_context(|| format!("[CheckAndGrantSkin] Failed to check if {} has {:?} skin", recipient_address, skin_type))?;

    if has_skin {
        info!("[CheckAndGrantSkin] Player {} already has {:?} skin (on-chain). Updating cache.", recipient_address, skin_type);
        let mut cache = aptos_ctx.granted_skins_cache.lock().await;
        cache.entry(recipient_address).or_default().insert(skin_type.to_cache_key());
        return Ok(());
    }

    info!("[CheckAndGrantSkin] Granting {:?} skin to player {} on-chain...", skin_type, recipient_address);
    grant_skin_on_aptos_internal(&aptos_ctx.client, &aptos_ctx.admin_account, &aptos_ctx.transaction_factory, &aptos_ctx.skin_module_id, skin_type.grant_function_name(), recipient_address).await.with_context(|| format!("[CheckAndGrantSkin] Failed to grant {:?} skin to {}", skin_type, recipient_address))?;

    info!("[CheckAndGrantSkin] Successfully granted {:?} skin to player {}. Updating cache.", skin_type, recipient_address);
    let mut cache = aptos_ctx.granted_skins_cache.lock().await;
    cache.entry(recipient_address).or_default().insert(skin_type.to_cache_key());
    Ok(())
}

use serde_json::json; // Add this import at the top of your file or where other serde_json imports are

async fn has_skin_on_aptos(client: &AptosClient, contract_address: AccountAddress, module_name: &Identifier, function_name: &str, user_address: AccountAddress) -> Result<bool> {
    let ident = Identifier::new(function_name.to_string()).map_err(|e_str| anyhow::anyhow!("[HasSkinOnAptos] Invalid identifier string '{}': {}", function_name, e_str))?;

    // Convert AccountAddress to its hex string representation for the API
    let user_address_hex_string = user_address.to_hex_literal(); // e.g., "0x..."

    let request = ViewRequest {
        function: EntryFunctionId{
            module: ModuleId::new(contract_address, module_name.clone()).into(),
            name: aptos_sdk::rest_client::aptos_api_types::IdentifierWrapper::from(ident),
        },
        type_arguments: vec![],
        // Pass the address as a JSON string value
        arguments: vec![json!(user_address_hex_string)],
    };

    let res = client.view(&request, None).await.context(format!("[HasSkinOnAptos] Aptos view call failed for function {}", function_name))?;
    let json_value = res.into_inner().get(0).cloned().context(format!("[HasSkinOnAptos] View function {} returned no values", function_name))?;
    let has_skin_val: bool = serde_json::from_value(json_value.clone()).context(format!("[HasSkinOnAptos] Failed to parse boolean from view response for {}: {:?}", function_name, json_value))?;
    Ok(has_skin_val)
}


async fn grant_skin_on_aptos_internal(
    client: &AptosClient,
    admin_account_arc: &Arc<LocalAccount>,
    txn_factory: &TransactionFactory,
    module_id: &ModuleId,
    function_name: &str,
    recipient_address: AccountAddress,
) -> Result<()> {
    info!("[GrantSkinInternal] Attempting to grant skin to {} via module {} function {}", recipient_address, module_id, function_name);
    let ident = Identifier::new(function_name.to_string()).map_err(|e_str| anyhow::anyhow!("[GrantSkinInternal] Invalid identifier string '{}': {}", function_name, e_str))?;
    let entry_payload = EntryFunction::new(module_id.clone(), ident, vec![], vec![bcs::to_bytes(&recipient_address)?]);
    let txn_payload = AptosTransactionPayload::EntryFunction(entry_payload);

    info!("[GrantSkinInternal] Building transaction for admin {} to call {} for recipient {}", admin_account_arc.address(), function_name, recipient_address);
    let signed_txn: SignedTransaction = admin_account_arc.sign_with_transaction_builder(txn_factory.payload(txn_payload));
    info!("[GrantSkinInternal] Transaction signed. Submitting and waiting...");

    let pending_txn_response = client.submit_and_wait(&signed_txn).await.context(format!("[GrantSkinInternal] Failed to submit and wait for {} transaction", function_name))?;

    let transaction_response_inner: &aptos_sdk::rest_client::Transaction = pending_txn_response.inner();

    let user_transaction_data: &AptosUserTransaction = match transaction_response_inner {
        aptos_sdk::rest_client::Transaction::UserTransaction(user_txn_data_box) => {
            &*user_txn_data_box
        }
        _ => {
            error!("[GrantSkinInternal] Submitted transaction was not a UserTransaction: {:?}", transaction_response_inner);
            bail!("[GrantSkinInternal] Submitted transaction was not a UserTransaction as expected.");
        }
    };

    // Corrected to use .info field based on your working code
    let transaction_hash = user_transaction_data.info.hash;

    if !user_transaction_data.info.success {
        error!(
            "[GrantSkinInternal] Grant skin transaction FAILED on chain. Hash: {:?}, VM Status: {}, Full info: {:?}",
            transaction_hash,
            user_transaction_data.info.vm_status, // Corrected
            user_transaction_data // Log the whole AptosUserTransaction for details
        );
        bail!(
            "[GrantSkinInternal] Grant skin transaction failed on chain. VM Status: {}.",
            user_transaction_data.info.vm_status // Corrected
        );
    }
    info!("[GrantSkinInternal] Grant skin transaction successful. Hash: {:?}", transaction_hash);
    Ok(())
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
    let admin_ed25519_private_key = Ed25519PrivateKey::try_from(private_key_bytes.as_slice()).context("[AptosContextSetup] Failed to create Ed25519PrivateKey from bytes")?;
    let admin_address = AccountAddress::from_str(&config.admin_address_hex).context(format!("[AptosContextSetup] Failed to parse admin address from hex: {}", config.admin_address_hex))?;
    info!("[AptosContextSetup] Admin address parsed: {}", admin_address);

    info!("[AptosContextSetup] Getting account info for admin from node...");
    let account_data_response = client.get_account(admin_address).await.context(format!("[AptosContextSetup] Failed to get admin account info from Aptos node for address {}", admin_address))?;
    let initial_sequence_number = account_data_response.inner().sequence_number;
    info!("[AptosContextSetup] Admin account sequence number: {}", initial_sequence_number);

    let admin_account = Arc::new(LocalAccount::new(admin_address, admin_ed25519_private_key, initial_sequence_number));
    info!("[AptosContextSetup] LocalAccount for admin created.");

    let skin_module_account_address = AccountAddress::from_str(&config.skin_module_account_address_hex).context(format!("[AptosContextSetup] Failed to parse skin module account address: {}", config.skin_module_account_address_hex))?;
    let skin_module_name_identifier = Identifier::new(config.skin_module_name.clone()).map_err(|e_str| anyhow::anyhow!("[AptosContextSetup] Invalid identifier for skin module name '{}': {}", config.skin_module_name, e_str))?;
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
    Ok(AptosContext { client, admin_account, skin_module_id, transaction_factory, granted_skins_cache: Arc::new(Mutex::new(HashMap::new())), })
}