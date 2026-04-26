#![cfg(test)]

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    Address, Env, IntoVal, String,
};

// ─── Shared setup ────────────────────────────────────────────────────────────
fn setup_test(
    env: &Env,
) -> (
    StellarBountyBoardContractClient<'static>,
    Address, // maintainer
    Address, // contributor
    Address, // token_id
    Address, // fee_recipient
) {
    let contract_id = env.register_contract(None, StellarBountyBoardContract);
    let client = StellarBountyBoardContractClient::new(env, &contract_id);

    let maintainer = Address::generate(env);
    let contributor = Address::generate(env);
    let fee_recipient = Address::generate(env);
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin);

    // Initialize contract with a fee recipient so fee tests work
    client.initialize(&fee_recipient);

    (client, maintainer, contributor, token_id.address(), fee_recipient)
}

#[test]
fn test_create_bounty() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, _contributor, token_id, _fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);

    token_admin.mint(&maintainer, &1000);

    let repo = String::from_str(&env, "ritik4ever/stellar-bounty-board");
    let title = String::from_str(&env, "Fix bug");
    let deadline = env.ledger().timestamp() + 1000;
    let amount = 500i128;
    let issue_number = 1u32;

    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &amount,
        &repo,
        &issue_number,
        &title,
        &deadline,
        &0u32, // zero fee — no behavior change
    );

    assert_eq!(bounty_id, 1);

    let bounty = client.get_bounty(&bounty_id);
    assert_eq!(bounty.maintainer, maintainer);
    assert_eq!(bounty.amount, amount);
    assert_eq!(bounty.status, BountyStatus::Open);
    assert_eq!(bounty.protocol_fee_bps, 0);
    assert_eq!(token.balance(&client.address), amount);
    assert_eq!(token.balance(&maintainer), 500);

    // Verify create event
    let events = env.events().all();
    let last_event = events.last().unwrap();
    
    assert_eq!(last_event.0, client.address);
    assert_eq!(last_event.1, (symbol_short!("Bounty"), symbol_short!("Create")).into_val(&env));
    let event_data: BountyCreated = last_event.2.into_val(&env);
    assert_eq!(event_data.bounty_id, 1);
    assert_eq!(event_data.maintainer, maintainer);
    assert_eq!(event_data.amount, amount);
    assert_eq!(event_data.protocol_fee_bps, 0);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_create_bounty_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, maintainer, _, token_id, _) = setup_test(&env);

    client.create_bounty(
        &maintainer,
        &token_id,
        &-1,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &0u32,
    );
}

#[test]
fn test_full_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, contributor, token_id, _fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &500,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &0u32, // zero fee
    );

    client.reserve_bounty(&bounty_id, &contributor);
    let bounty = client.get_bounty(&bounty_id);
    assert_eq!(bounty.status, BountyStatus::Reserved);
    assert_eq!(bounty.contributor, Some(contributor.clone()));

    client.submit_bounty(&bounty_id, &contributor);
    let bounty = client.get_bounty(&bounty_id);
    assert_eq!(bounty.status, BountyStatus::Submitted);

    client.release_bounty(&bounty_id, &maintainer);
    let bounty = client.get_bounty(&bounty_id);
    assert_eq!(bounty.status, BountyStatus::Released);

    // With 0% fee: contributor receives full 500
    assert_eq!(token.balance(&contributor), 500);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_refund_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, _contributor, token_id, _fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let deadline = env.ledger().timestamp() + 1000;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &500,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &deadline,
        &0u32,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = deadline + 1;
    });

    client.refund_bounty(&bounty_id, &maintainer);
    let bounty = client.get_bounty(&bounty_id);
    assert_eq!(bounty.status, BountyStatus::Refunded);
    // Refund returns full amount — no fee deducted
    assert_eq!(token.balance(&maintainer), 1000);
}

#[test]
#[should_panic(expected = "bounty must be submitted")]
fn test_release_without_submit() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, contributor, token_id, _) = setup_test(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &500,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &0u32,
    );

    client.reserve_bounty(&bounty_id, &contributor);
    client.release_bounty(&bounty_id, &maintainer);
}

#[test]
fn test_expiration() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, _contributor, token_id, _) = setup_test(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let deadline = env.ledger().timestamp() + 1000;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &500,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &deadline,
        &0u32,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = deadline + 1;
    });

    let bounty = client.get_bounty(&bounty_id);
    assert_eq!(bounty.status, BountyStatus::Expired);
}

#[test]
#[should_panic(expected = "bounty is not open")]
fn test_reserve_expired_bounty() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, contributor, token_id, _) = setup_test(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let deadline = env.ledger().timestamp() + 1000;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &500,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &deadline,
        &0u32,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = deadline + 1;
    });

    client.reserve_bounty(&bounty_id, &contributor);
}

//  new fee tests
/// 0 bps: contributor receives 100% of the escrowed amount
#[test]
fn test_fee_zero_bps_full_payout() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, contributor, token_id, fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let amount = 1000i128;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &amount,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &0u32, // 0 bps
    );

    client.reserve_bounty(&bounty_id, &contributor);
    client.submit_bounty(&bounty_id, &contributor);
    client.release_bounty(&bounty_id, &maintainer);

    // Contributor gets everything
    assert_eq!(token.balance(&contributor), 1000);
    // Fee recipient gets nothing
    assert_eq!(token.balance(&fee_recipient), 0);
    // Contract is empty
    assert_eq!(token.balance(&client.address), 0);
}

/// 100 bps (1%): on 1000 tokens ==> fee = 10, contributor receives 990
#[test]
fn test_fee_100_bps_one_percent() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, contributor, token_id, fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let amount = 1000i128;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &amount,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &100u32, // 1% = 100 bps
    );

    client.reserve_bounty(&bounty_id, &contributor);
    client.submit_bounty(&bounty_id, &contributor);
    client.release_bounty(&bounty_id, &maintainer);

    // fee = 1000 * 100 / 10_000 = 10
    assert_eq!(token.balance(&contributor), 990);
    assert_eq!(token.balance(&fee_recipient), 10);
    assert_eq!(token.balance(&client.address), 0);
}

/// 500 bps (5%): on 1000 tokens => fee = 50, contributor receives 950
#[test]
fn test_fee_500_bps_five_percent() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, contributor, token_id, fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let amount = 1000i128;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &amount,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &500u32, // 5% = 500 bps
    );

    client.reserve_bounty(&bounty_id, &contributor);
    client.submit_bounty(&bounty_id, &contributor);
    client.release_bounty(&bounty_id, &maintainer);

    // fee = 1000 * 500 / 10_000 = 50
    assert_eq!(token.balance(&contributor), 950);
    assert_eq!(token.balance(&fee_recipient), 50);
    assert_eq!(token.balance(&client.address), 0);
}

/// Fee is deducted from payout, not added on top.
/// Escrowed amount stays 1000; contributor gets less, total stays 1000.
#[test]
fn test_fee_deducted_from_payout_not_added_on_top() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, contributor, token_id, fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let amount = 1000i128;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &amount,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &200u32, // 2%
    );

    client.reserve_bounty(&bounty_id, &contributor);
    client.submit_bounty(&bounty_id, &contributor);
    client.release_bounty(&bounty_id, &maintainer);

    let net = token.balance(&contributor);
    let fee = token.balance(&fee_recipient);

    // Total out == total escrowed fee was deducted, not added
    assert_eq!(net + fee, amount);
    assert_eq!(fee, 20);  // 2% of 1000
    assert_eq!(net, 980);
}

/// Guard: fee exceeding 10000 bps (100%) must panic
#[test]
#[should_panic(expected = "fee exceeds 100%")]
fn test_fee_exceeds_max_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, _, token_id, _) = setup_test(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    client.create_bounty(
        &maintainer,
        &token_id,
        &500,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &(env.ledger().timestamp() + 1000),
        &10_001u32, // over 100%
    );
}

/// Refund always returns full escrow amount regardless of fee setting
#[test]
fn test_refund_returns_full_amount_ignoring_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, maintainer, _contributor, token_id, fee_recipient) = setup_test(&env);
    let token = TokenClient::new(&env, &token_id);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&maintainer, &1000);

    let deadline = env.ledger().timestamp() + 1000;
    let bounty_id = client.create_bounty(
        &maintainer,
        &token_id,
        &500,
        &String::from_str(&env, "repo"),
        &1,
        &String::from_str(&env, "title"),
        &deadline,
        &500u32, // 5% fee set, but should not apply to refunds
    );

    env.ledger().with_mut(|li| {
        li.timestamp = deadline + 1;
    });

    client.refund_bounty(&bounty_id, &maintainer);

    // Full amount back to maintainer — fee recipient gets nothing on refund
    assert_eq!(token.balance(&maintainer), 1000);
    assert_eq!(token.balance(&fee_recipient), 0);
}