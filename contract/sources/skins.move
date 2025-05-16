// player_skins.move (Illustrative - full path would be like sources/player_skins.move in an Aptos package)

module player_skin_module_admin::player_skins { 

    use std::signer;
    use std::error;
    use aptos_framework::table::{Self, Table};

    // --- Errors ---
    const ENOT_AUTHORIZED: u64 = 1; // Error code for unauthorized access
    const ESKIN_ALREADY_GRANTED: u64 = 2; // Optional: if you want to prevent re-granting

    // --- Resources ---
    // Resource to store contract owner, stored under the deployer's account
    struct ModuleOwner has key {
        owner_address: address,
    }

    // We use a simple struct as the value in the Table.
    // Its existence at user_address indicates skin ownership.
    struct PinkSkinRecord has store, drop {}
    struct RainbowSkinRecord has store, drop {}

    // Tables to store who has which skin.
    // These will be stored under the deployer's account as resources.
    struct PinkSkinHolders has key {
        skins: Table<address, PinkSkinRecord>,
    }

    struct RainbowSkinHolders has key {
        skins: Table<address, RainbowSkinRecord>,
    }

    // --- Initialize Module (called on deployment) ---
    // Stores the deployer's address as the ModuleOwner.
    // Initializes the skin holder tables.
    fun init_module(sender: &signer) {
        let deployer_address = signer::address_of(sender);

        // Assert this is only called once during module publish by the deployer
        assert!(!exists<ModuleOwner>(deployer_address), error::already_exists(ENOT_AUTHORIZED)); // Or a different error code for init
        assert!(!exists<PinkSkinHolders>(deployer_address), error::already_exists(ENOT_AUTHORIZED));
        assert!(!exists<RainbowSkinHolders>(deployer_address), error::already_exists(ENOT_AUTHORIZED));

        move_to(sender, ModuleOwner { owner_address: deployer_address });
        move_to(sender, PinkSkinHolders { skins: table::new<address, PinkSkinRecord>() });
        move_to(sender, RainbowSkinHolders { skins: table::new<address, RainbowSkinRecord>() });
    }

    // --- Private Helper Functions ---
    // Asserts that the caller is the module owner.
    fun assert_is_owner(account: &signer) acquires ModuleOwner {
        let caller_address = signer::address_of(account);
        let module_owner_address = borrow_global<ModuleOwner>(@YOUR_DEPLOYER_ADDRESS).owner_address; // Assuming ModuleOwner is under @YOUR_DEPLOYER_ADDRESS
                                                                                                // Or, if ModuleOwner resource is under the actual owner's address:
                                                                                                // let module_owner_address = borrow_global<ModuleOwner>(signer::address_of(account)).owner_address;
                                                                                                // but the resource should be under a fixed address.
        assert!(caller_address == module_owner_address, error::permission_denied(ENOT_AUTHORIZED));
    }

    // --- Entry Functions (callable by contract owner) ---

    // Grants the pink skin to a recipient address.
    // Can only be called by the module owner.
    public entry fun grant_pink_skin(owner_account: &signer, recipient: address)
    acquires ModuleOwner, PinkSkinHolders {
        assert_is_owner(owner_account); // Ensure caller is the owner

        let deployer_address = borrow_global<ModuleOwner>(@YOUR_DEPLOYER_ADDRESS).owner_address;
        let pink_skin_holders = borrow_global_mut<PinkSkinHolders>(deployer_address);

        // Optional: Check if skin is already granted to prevent redundant operations or events
        // assert!(!table::contains(&pink_skin_holders.skins, recipient), error::already_exists(ESKIN_ALREADY_GRANTED));

        table::add(&mut pink_skin_holders.skins, recipient, PinkSkinRecord {});
    }

    // Grants the rainbow skin to a recipient address.
    // Can only be called by the module owner.
    public entry fun grant_rainbow_skin(owner_account: &signer, recipient: address)
    acquires ModuleOwner, RainbowSkinHolders {
        assert_is_owner(owner_account); // Ensure caller is the owner

        let deployer_address = borrow_global<ModuleOwner>(@YOUR_DEPLOYER_ADDRESS).owner_address;
        let rainbow_skin_holders = borrow_global_mut<RainbowSkinHolders>(deployer_address);

        // Optional: Check if skin is already granted
        // assert!(!table::contains(&rainbow_skin_holders.skins, recipient), error::already_exists(ESKIN_ALREADY_GRANTED));
        
        table::add(&mut rainbow_skin_holders.skins, recipient, RainbowSkinRecord {});
    }

    // --- View Functions (callable by anyone) ---

    #[view]
    // Checks if a user has the pink skin.
    public fun has_pink_skin(user: address): bool
    acquires PinkSkinHolders {
        // Assume ModuleOwner resource (and thus PinkSkinHolders) is under @YOUR_DEPLOYER_ADDRESS
        if (!exists<PinkSkinHolders>(@YOUR_DEPLOYER_ADDRESS)) {
            return false // Table not initialized yet
        };
        let pink_skin_holders = borrow_global<PinkSkinHolders>(@YOUR_DEPLOYER_ADDRESS);
        table::contains(&pink_skin_holders.skins, user)
    }

    #[view]
    // Checks if a user has the rainbow skin.
    public fun has_rainbow_skin(user: address): bool
    acquires RainbowSkinHolders {
        if (!exists<RainbowSkinHolders>(@YOUR_DEPLOYER_ADDRESS)) {
            return false // Table not initialized yet
        };
        let rainbow_skin_holders = borrow_global<RainbowSkinHolders>(@YOUR_DEPLOYER_ADDRESS);
        table::contains(&rainbow_skin_holders.skins, user)
    }
}