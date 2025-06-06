// src/App.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';

import {
  DbConnection,
  Player,
  Circle as CircleTableEntry,
  Food as FoodTableEntry,
  Entity as ServerEntity,
  Config,
  DbVector2,
} from "../../../spacetime-agario/client/src/module_bindings";
import type {
  EventContext,
  ErrorContext
} from "../../../spacetime-agario/client/src/module_bindings";

import { Identity } from '@clockworklabs/spacetimedb-sdk';
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"; // Added for Aptos interaction

// Petra Wallet specific type, or a more generic Aptos Standard Wallet type
interface AptosWallet {
  connect: () => Promise<{ address: string; publicKey: string; [key: string]: any }>;
  account: () => Promise<{ address: string; publicKey: string; [key: string]: any }>;
  disconnect: () => Promise<void>;
  network: () => Promise<string>;
  isConnected: () => Promise<boolean>;
}

const TARGET_FOOD_COUNT = 600;
const APTOS_NETWORK: Network = Network.TESTNET;

// Read environment variables with fallback values
const SPACETIMEDB_URI = import.meta.env.VITE_SPACETIMEDB_URI || 'ws://localhost:3000';
const MODULE_NAME = import.meta.env.VITE_MODULE_NAME || 'spacetime-agario';
const PLAYER_SKIN_MODULE_ADDRESS = import.meta.env.VITE_PLAYER_SKIN_MODULE_ADDRESS || '0xYOUR_ACCOUNT_ADDRESS_THAT_DEPLOYED_THE_MODULE';

// Initialize Aptos client (can be outside the component if config is static)
const aptosConfig = new AptosConfig({ network: APTOS_NETWORK });
const aptosClient = new Aptos(aptosConfig);

type PlayerSkin = 'none' | 'pink' | 'rainbow';


function massToRadius(mass: number): number {
    return Math.sqrt(mass);
}

export interface RenderableFood {
    entityId: number;
    position: DbVector2;
    radius: number;
    mass: number;
}

export type RenderableCircle = CircleTableEntry & {
    position: DbVector2;
    mass: number;
    radius: number;
};

// --- Custom Hooks (Full versions as previously established - collapsed for brevity in this diff) ---
function useEntities(conn: DbConnection | null): Map<number, ServerEntity> {
    const [entities, setEntities] = useState<Map<number, ServerEntity>>(new Map());
    useEffect(() => {
        if (!conn?.db?.entity) { setEntities(new Map()); return; }
        const loadInitialData = () => { if (conn?.db?.entity && typeof conn.db.entity.iter === 'function') { try { const all = Array.from(conn.db.entity.iter()); setEntities(new Map(all.map(e => [e.entityId, e]))); } catch (e) { console.error("[useEntities] Error iter:", e); } } else { console.warn("[useEntities] No .iter()"); }}; loadInitialData();
        const onInsert = (_ctx: EventContext, entity: ServerEntity) => setEntities(prev => new Map(prev).set(entity.entityId, entity)); conn.db.entity.onInsert(onInsert);
        const onUpdate = (_ctx: EventContext, _old: ServerEntity, newEntity: ServerEntity) => setEntities(prev => new Map(prev).set(newEntity.entityId, newEntity)); conn.db.entity.onUpdate(onUpdate);
        const onDelete = (_ctx: EventContext, entity: ServerEntity) => setEntities(prev => { const next = new Map(prev); next.delete(entity.entityId); return next; }); conn.db.entity.onDelete(onDelete);
        return () => { if (conn?.db?.entity) { conn.db.entity.removeOnInsert(onInsert); conn.db.entity.removeOnUpdate(onUpdate); conn.db.entity.removeOnDelete(onDelete); }};
    }, [conn]);
    return entities;
}
function usePlayers(conn: DbConnection | null): Map<string, Player> {
  const [playersMap, setPlayersMap] = useState<Map<string, Player>>(new Map());
  useEffect(() => {
    if (!conn?.db?.player) { setPlayersMap(new Map()); return; }
    const normalizeSdkPlayer = (sdkPlayer: any): Player => {
        let actualPlayerId: number | undefined = undefined;
        if (typeof sdkPlayer.playerId === 'number') { actualPlayerId = sdkPlayer.playerId;
        } else if (typeof sdkPlayer.player_id === 'number') { actualPlayerId = sdkPlayer.player_id;}
        let actualAptosAddress: string | null = null; 
        if (typeof sdkPlayer.aptosAddress === 'string') { actualAptosAddress = sdkPlayer.aptosAddress;
        } else if (typeof sdkPlayer.aptos_address === 'string') { actualAptosAddress = sdkPlayer.aptos_address;}
        const typedPlayer: Player = { identity: sdkPlayer.identity, player_id: actualPlayerId as number, name: sdkPlayer.name, aptos_address: actualAptosAddress, };
        if (typeof typedPlayer.player_id !== 'number') { console.warn(`[usePlayers] Normalized player for ${typedPlayer.identity.toHexString()} has invalid player_id: ${typedPlayer.player_id}. SDK raw:`, sdkPlayer); }
        return typedPlayer;
    };
    const loadInitialData = () => { if (conn?.db?.player && typeof conn.db.player.iter === 'function') { try { const allPlayersFromTableSDK = Array.from(conn.db.player.iter()); const initialPlayersMap = new Map<string, Player>(); allPlayersFromTableSDK.forEach(p_sdk => { const normalized = normalizeSdkPlayer(p_sdk); initialPlayersMap.set(normalized.identity.toHexString(), normalized); }); setPlayersMap(initialPlayersMap); } catch (e) { console.error("[usePlayers] Error iter:", e); } } else { console.warn("[usePlayers] No .iter()"); }}; loadInitialData();
    const handlePlayerUpdate = (playerDataFromSDK: any, action: string) => { const normalizedPlayer = normalizeSdkPlayer(playerDataFromSDK); setPlayersMap(prev => new Map(prev).set(normalizedPlayer.identity.toHexString(), normalizedPlayer)); };
    const onInsert = (_ctx: EventContext, p: Player) => handlePlayerUpdate(p, "Insert"); conn.db.player.onInsert(onInsert);
    const onUpdate = (_ctx: EventContext, _o: Player, n: Player) => handlePlayerUpdate(n, "Update"); conn.db.player.onUpdate(onUpdate);
    const onDelete = (_ctx: EventContext, p_sdk: any) => { const idToDelete = p_sdk.identity.toHexString(); setPlayersMap(prev => { const next = new Map(prev); next.delete(idToDelete); return next; }); }; conn.db.player.onDelete(onDelete);
    return () => { if (conn?.db?.player) { conn.db.player.removeOnInsert(onInsert); conn.db.player.removeOnUpdate(onUpdate); conn.db.player.removeOnDelete(onDelete); }};
  }, [conn]);
  return playersMap;
}
function useCirclesInTable(conn: DbConnection | null): CircleTableEntry[] {
  const [circlesArr, setCirclesArr] = useState<CircleTableEntry[]>([]);
  useEffect(() => {
    if (!conn?.db?.circle) { setCirclesArr([]); return; }
    const normalizeCircle = (circleDataFromSDK: any): CircleTableEntry => { const actualPlayerId = (circleDataFromSDK as any).playerId ?? circleDataFromSDK.player_id; return { entityId: circleDataFromSDK.entityId, player_id: actualPlayerId as number, direction: circleDataFromSDK.direction, speed: circleDataFromSDK.speed, last_split_time: circleDataFromSDK.last_split_time }; };
    const loadInitialData = () => { if (conn?.db?.circle && typeof conn.db.circle.iter === 'function') { try { const allRawCircles = Array.from(conn.db.circle.iter()); setCirclesArr(allRawCircles.map(normalizeCircle)); } catch (e) { console.error("[useCirclesInTable] Error iter:", e); } } else { console.warn("[useCirclesInTable] No .iter()"); }}; loadInitialData();
    const eq = (c1: CircleTableEntry, c2: CircleTableEntry) => c1.entityId === c2.entityId;
    const onInsert = (_ctx: EventContext, c_sdk: any) => { const norm = normalizeCircle(c_sdk); setCirclesArr(prev => [...prev, norm]); }; conn.db.circle.onInsert(onInsert);
    const onUpdate = (_ctx: EventContext, _o: CircleTableEntry, n_sdk: any) => { const norm = normalizeCircle(n_sdk); setCirclesArr(prev => prev.map(c => eq(c, norm) ? norm : c)); }; conn.db.circle.onUpdate(onUpdate);
    const onDelete = (_ctx: EventContext, c_sdk: any) => { const norm = normalizeCircle(c_sdk); setCirclesArr(prev => prev.filter(el => el.entityId !== norm.entityId)); }; conn.db.circle.onDelete(onDelete);
    return () => { if (conn?.db?.circle) { conn.db.circle.removeOnInsert(onInsert); conn.db.circle.removeOnUpdate(onUpdate); conn.db.circle.removeOnDelete(onDelete); }};
  }, [conn]);
  return circlesArr;
}
function useFood(conn: DbConnection | null, allEntities: Map<number, ServerEntity>): RenderableFood[] {
  const [renderableFood, setRenderableFood] = useState<RenderableFood[]>([]);
  const [foodEntityIds, setFoodEntityIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!conn?.db?.food) { setFoodEntityIds(new Set()); return; }
    const loadInitialFoodIds = () => { if (conn?.db?.food && typeof conn.db.food.iter === 'function') { try { const entries = Array.from(conn.db.food.iter()); setFoodEntityIds(new Set(entries.map(f => f.entityId))); } catch (e) { console.error("[useFood] Error iter IDs:", e); } } else { console.warn("[useFood] No .iter() for IDs");}}; loadInitialFoodIds();
    const onFoodInsert = (_ctx: EventContext, fe: FoodTableEntry) => { setFoodEntityIds(prev => new Set(prev).add(fe.entityId)); }; conn.db.food.onInsert(onFoodInsert);
    const onFoodDelete = (_ctx: EventContext, fe: FoodTableEntry) => { setFoodEntityIds(prev => { const next = new Set(prev); next.delete(fe.entityId); return next; }); }; conn.db.food.onDelete(onFoodDelete);
    return () => { if (conn?.db?.food) { conn.db.food.removeOnInsert(onFoodInsert); conn.db.food.removeOnDelete(onFoodDelete); }};
  }, [conn]);
  useEffect(() => {
    const newRenderable: RenderableFood[] = [];
    for (const id of foodEntityIds) { const entity = allEntities.get(id); if (entity?.position && typeof entity.mass === 'number') { newRenderable.push({ entityId: id, position: entity.position, mass: entity.mass, radius: massToRadius(entity.mass) }); } }
    setRenderableFood(newRenderable);
  }, [foodEntityIds, allEntities]);
  return renderableFood;
}
function useConfig(conn: DbConnection | null): Config | null {
  const [configState, setConfigState] = useState<Config | null>(null);
  useEffect(() => {
    if (!conn?.db?.config) { setConfigState(null); return; }
    const loadInitialData = () => { if (conn?.db?.config && typeof conn.db.config.iter === 'function') { try { const all = Array.from(conn.db.config.iter()); if (all.length > 0) { setConfigState(all[0]); } else { console.warn("[useConfig] No config found during initial load.");} } catch (e) { console.error("[useConfig] Error iter:", e); } } else { console.warn("[useConfig] No .iter()");}}; loadInitialData();
    const onConfigChange = (_ctx: EventContext, nc: Config) => { setConfigState(nc);}; 
    conn.db.config.onInsert(onConfigChange); conn.db.config.onUpdate((ctx, _o,n)=>onConfigChange(ctx,n));
    return () => { if (conn?.db?.config) { conn.db.config.removeOnInsert(onConfigChange); conn.db.config.removeOnUpdate((ctx,_o,n)=>onConfigChange(ctx,n));}};
  }, [conn]);
  return configState;
}

// --- Main Application Component ---
function App() {
  const [dbConn, setDbConn] = useState<DbConnection | null>(null);
  const [clientIdentity, setClientIdentity] = useState<Identity | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [areAllSubscriptionsApplied, setAreAllSubscriptionsApplied] = useState(false);
  
  const [aptosWalletAddress, setAptosWalletAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isPetraWalletInstalled, setIsPetraWalletInstalled] = useState(false);
  const [playerSkin, setPlayerSkin] = useState<PlayerSkin>('none'); // Added for skin status

  type GamePhase = 'connecting' | 'wallet_connect' | 'loading_data' | 'login' | 'playing' | 'dead';
  const [gamePhase, setGamePhase] = useState<GamePhase>('connecting');
  const [playerNameInput, setPlayerNameInput] = useState('');

  const entities = useEntities(dbConn);
  const players = usePlayers(dbConn);
  const circlesInTable = useCirclesInTable(dbConn);
  const renderableFoodItems = useFood(dbConn, entities);
  const gameConfig = useConfig(dbConn);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if ((window as any).petra || (window as any).aptos) {
        setIsPetraWalletInstalled(true);
    }
  }, []);

  const renderableCircles = React.useMemo(() => {
    const result = circlesInTable.map((circleEntry) => {
        const entityData = entities.get(circleEntry.entityId);
        if (entityData?.position && typeof entityData.mass === 'number' && typeof circleEntry.player_id === 'number') {
            return { ...circleEntry, position: entityData.position, mass: entityData.mass, radius: massToRadius(entityData.mass) } as RenderableCircle;
        }
        return null;
    }).filter(Boolean) as RenderableCircle[];
    return result;
  }, [circlesInTable, entities]);

  // SpacetimeDB Connection Effect (unchanged, kept for context)
  useEffect(() => { 
    console.log(`Effect for DB Connection setup is running.`);
    let isCancelled = false;
    const onConnectHandler = (connInst: DbConnection, identity: Identity, token: string) => { if (isCancelled) return; console.log('Connected to SpacetimeDB with identity:', identity.toHexString()); localStorage.setItem('spacetimedb_auth_token', token); setClientIdentity(identity); setIsConnected(true); setConnectionError(null); setAreAllSubscriptionsApplied(false); const queries = ['SELECT * FROM player', 'SELECT * FROM circle', 'SELECT * FROM food', 'SELECT * FROM config', 'SELECT * FROM entity']; let subscribedCount = 0; if (!connInst?.db) { if (!isCancelled) { setConnectionError("DB instance not ready for subs."); setGamePhase('connecting'); } return; } queries.forEach(query => connInst.subscriptionBuilder().onApplied(() => { if (isCancelled) return; subscribedCount++; if (subscribedCount === queries.length) { console.log('All subscriptions applied.'); if (!isCancelled) setAreAllSubscriptionsApplied(true); } }).onError((_errCtx, errMsg) => { if (isCancelled) return; console.error(`Sub error ${query}:`, errMsg); if (!isCancelled) setConnectionError(`Sub failed: ${errMsg}`); }).subscribe(query)); };
    const onDisconnectHandler = () => { if (isCancelled) return; console.log('Disconnected'); setIsConnected(false); setClientIdentity(null); setAreAllSubscriptionsApplied(false); setAptosWalletAddress(null); if (!isCancelled) setGamePhase('connecting'); };
    const onConnectErrorHandler = (_ctx: ErrorContext | null, err: Error | string) => { if (isCancelled) return; const msg = typeof err === 'string' ? err : (err.message || "Unknown conn error"); console.error('Connect Error:', msg, err); if (!isCancelled) { setConnectionError(msg); setGamePhase('connecting'); }};
    console.log(`Attempting connect: ${SPACETIMEDB_URI}, Module: ${MODULE_NAME}`);
    const authToken = localStorage.getItem('spacetimedb_auth_token');
    const newConnection = DbConnection.builder().withUri(SPACETIMEDB_URI).withModuleName(MODULE_NAME).withToken(authToken || undefined).onConnect(onConnectHandler).onDisconnect(onDisconnectHandler).onConnectError(onConnectErrorHandler).build();
    if (!isCancelled) setDbConn(newConnection);
    return () => { isCancelled = true; console.log("Cleanup: Disconnecting."); newConnection?.disconnect(); };
  }, []);
  
  // Game Phase Determination Effect (unchanged, kept for context)
  useEffect(() => { 
    const currentIdentity = clientIdentity;
    const currentPlayer = currentIdentity ? players.get(currentIdentity.toHexString()) : null;
    let newPhase = gamePhase;
    if (!isConnected || !dbConn) newPhase = 'connecting';
    else if (!aptosWalletAddress) newPhase = 'wallet_connect';
    else if (!currentIdentity || !areAllSubscriptionsApplied || !gameConfig || (currentPlayer && typeof currentPlayer.player_id !== 'number') || (entities.size === 0 && TARGET_FOOD_COUNT > 0 && gamePhase !== 'login' && gamePhase !== 'playing' && gamePhase !== 'dead') ) { newPhase = 'loading_data'; }
    else if (currentPlayer && typeof currentPlayer.player_id === 'number') {
        const playerOwnedRenderableCircles = renderableCircles.filter(c => c.player_id === currentPlayer.player_id);
        const isAlive = playerOwnedRenderableCircles.length > 0;
        if (isAlive) { newPhase = 'playing'; } 
        else { if (currentPlayer.name && currentPlayer.name.length > 0) { newPhase = 'dead'; } else { newPhase = 'login'; } }
    }
    else { newPhase = 'login'; }
    if (newPhase !== gamePhase) { setGamePhase(newPhase); }
  }, [isConnected, clientIdentity, players, areAllSubscriptionsApplied, gameConfig, dbConn, gamePhase, renderableCircles, entities, aptosWalletAddress]);

  // --- New useEffect for checking player skins on Aptos ---
  useEffect(() => {
    if (!aptosWalletAddress || PLAYER_SKIN_MODULE_ADDRESS === "0xYOUR_ACCOUNT_ADDRESS_THAT_DEPLOYED_THE_MODULE") {
      setPlayerSkin('none');
      if (PLAYER_SKIN_MODULE_ADDRESS === "0xYOUR_ACCOUNT_ADDRESS_THAT_DEPLOYED_THE_MODULE" && aptosWalletAddress) {
          console.warn("Player skin check: PLAYER_SKIN_MODULE_ADDRESS is not configured.");
      }
      return; // No wallet connected or module address not set, do nothing and ensure skin is reset
    }

    const fetchAndSetSkinStatus = async () => {
      if (!aptosWalletAddress) return; // Guard, though outer check should prevent this

      try {
        // Check for Rainbow skin first as it takes precedence
        const hasRainbowPayload = {
          function: `${PLAYER_SKIN_MODULE_ADDRESS}::player_skins::has_rainbow_skin`,
          functionArguments: [aptosWalletAddress],
        };
        // console.log("Checking rainbow skin for:", aptosWalletAddress);
        const rainbowResultRaw = await aptosClient.view({ payload: hasRainbowPayload });
        const hasRainbow = rainbowResultRaw[0] as boolean;
        // console.log("Raw Rainbow Result:", rainbowResultRaw, "Has Rainbow:", hasRainbow);


        if (hasRainbow) {
          setPlayerSkin('rainbow');
          // console.log("Player has RAINBOW skin");
          return;
        }

        // If not rainbow, check for Pink skin
        const hasPinkPayload = {
          function: `${PLAYER_SKIN_MODULE_ADDRESS}::player_skins::has_pink_skin`,
          functionArguments: [aptosWalletAddress],
        };
        // console.log("Checking pink skin for:", aptosWalletAddress);
        const pinkResultRaw = await aptosClient.view({ payload: hasPinkPayload });
        const hasPink = pinkResultRaw[0] as boolean;
        // console.log("Raw Pink Result:", pinkResultRaw, "Has Pink:", hasPink);


        if (hasPink) {
          setPlayerSkin('pink');
          // console.log("Player has PINK skin");
        } else {
          setPlayerSkin('none');
          // console.log("Player has NO special skin");
        }
      } catch (error) {
        console.error("Error fetching player skin status from Aptos contract:", error);
        // setPlayerSkin('none'); // Optionally reset skin on error, or keep last known
      }
    };

    fetchAndSetSkinStatus(); // Initial check
    const intervalId = setInterval(fetchAndSetSkinStatus, 5000); // Check every second

    return () => {
      clearInterval(intervalId);
    };
  }, [aptosWalletAddress]); // Re-run if aptosWalletAddress changes


  const handleConnectWallet = async () => { 
    setWalletError(null);
    const walletProvider: AptosWallet | undefined = (window as any).petra || (window as any).aptos;
    if (walletProvider) {
        try {
            if (walletProvider.isConnected && await walletProvider.isConnected()) {
                const account = await walletProvider.account();
                setAptosWalletAddress(account.address);
            } else {
                const account = await walletProvider.connect();
                setAptosWalletAddress(account.address);
            }
        } catch (error: any) { setWalletError(error?.message || "Failed to connect wallet."); }
    } else { setWalletError("Aptos wallet not found."); }
  };

  const handleEnterGame = useCallback((e: React.FormEvent) => { 
    e.preventDefault(); 
    if (dbConn?.reducers && playerNameInput.trim() && aptosWalletAddress &&
        (gamePhase === 'login' || gamePhase === 'loading_data')) { 
        dbConn.reducers.enterGame(playerNameInput.trim(), aptosWalletAddress); 
    } else {
        console.warn("Cannot enter game. Conditions not met.", {dbConn:!!dbConn, name:playerNameInput, aptos:aptosWalletAddress, phase:gamePhase});
    }
  }, [dbConn, playerNameInput, gamePhase, aptosWalletAddress]);

  const handleRespawn = useCallback(() => { if (dbConn?.reducers && gamePhase === 'dead') { dbConn.reducers.respawn(); } }, [dbConn, gamePhase]);
  const handleSplit = useCallback(() => { if (dbConn?.reducers && gamePhase === 'playing') { dbConn.reducers.player_split(); } }, [dbConn, gamePhase]);
  const handleSuicide = useCallback(() => { if (dbConn?.reducers && gamePhase === 'playing') { dbConn.reducers.suicide(); } }, [dbConn, gamePhase]);

  useEffect(() => { // Mouse move (unchanged, kept for context)
    if (gamePhase !== 'playing' || !dbConn?.reducers || !canvasRef.current || !gameConfig) return;
    const canvas = canvasRef.current;
    const actualMouseMoveHandler = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect(); const midX = canvas.width / 2; const midY = canvas.height / 2;
      let dx = event.clientX - rect.left - midX; let dy = event.clientY - rect.top - midY;
      const mag = Math.sqrt(dx * dx + dy * dy); if (mag < 1) return; 
      dx /= mag; dy /= mag;
      dbConn.reducers.updatePlayerInput({ x: dx, y: dy } as DbVector2);
    };
    window.addEventListener('mousemove', actualMouseMoveHandler);
    return () => window.removeEventListener('mousemove', actualMouseMoveHandler);
  }, [gamePhase, dbConn, gameConfig]);

  useEffect(() => { // Keyboard for Split (unchanged, kept for context)
    const handleKeyDown = (event: KeyboardEvent) => { if (event.code === 'Space' || event.key === ' ') { event.preventDefault(); handleSplit(); }};
    if (gamePhase === 'playing') { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }
  }, [gamePhase, handleSplit]);

  // --- Canvas Rendering Effect (MODIFIED) ---
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const world_size_cfg = gameConfig?.world_size ? Number(gameConfig.world_size) : 1000;
    
    const actualRenderErrorOrLoading = (message: string) => {
        ctx.fillStyle = '#333'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '24px Arial';
        if (connectionError && gamePhase !== 'wallet_connect') { 
            ctx.fillText(`SDB Error: ${connectionError}`, canvas.width/2, canvas.height/2 - 20);
        } else { ctx.fillText(message, canvas.width/2, canvas.height/2); }
    };

    const currentPlayerForLoadingCheck = clientIdentity ? players.get(clientIdentity.toHexString()) : null;
    if (!gameConfig || !isConnected || gamePhase === 'wallet_connect' ||
        (gamePhase === 'loading_data' && (!currentPlayerForLoadingCheck || typeof currentPlayerForLoadingCheck.player_id !== 'number')) ) { 
      let loadingMessage = 'Connecting...';
      if (isConnected && gamePhase === 'wallet_connect') loadingMessage = 'Connect Aptos Wallet';
      else if (isConnected && gameConfig) loadingMessage = 'Loading Player Data...';
      else if (isConnected) loadingMessage = 'Loading Config...';
      actualRenderErrorOrLoading(loadingMessage); 
      return; 
    }
    if (gamePhase === 'loading_data') { actualRenderErrorOrLoading('Loading Game Data...'); return; }

    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let camX = world_size_cfg / 2; let camY = world_size_cfg / 2;
    const currentPlayer = clientIdentity ? players.get(clientIdentity.toHexString()) : null;
    let currentPlayerTotalMass = 0;
    
    // Calculate camera and mass (unchanged logic)
    if (currentPlayer && typeof currentPlayer.player_id === 'number' && (gamePhase === 'playing' || gamePhase === 'dead')) {
        const playerOwnedRenderableCircles = renderableCircles.filter(c => c.player_id === currentPlayer.player_id);
        playerOwnedRenderableCircles.forEach(c => { if (c.mass) currentPlayerTotalMass += c.mass; });
        if (gamePhase === 'playing' && playerOwnedRenderableCircles.length > 0) {
            let xSum = 0, ySum = 0, mSumForCamera = 0;
            playerOwnedRenderableCircles.forEach(c => { if (c.position && c.mass) { xSum += c.position.x * c.mass; ySum += c.position.y * c.mass; mSumForCamera += c.mass;}});
            if (mSumForCamera > 0) { camX = xSum / mSumForCamera; camY = ySum / mSumForCamera; }
        }
    }

    ctx.save(); ctx.translate(canvas.width/2 - camX, canvas.height/2 - camY);
    ctx.strokeStyle = '#444'; ctx.lineWidth = Math.max(5, world_size_cfg/200); ctx.strokeRect(0,0,world_size_cfg, world_size_cfg);
    renderableFoodItems.forEach(f => { if (f?.position && f.radius) { ctx.beginPath(); ctx.arc(f.position.x, f.position.y, f.radius, 0, 2*Math.PI); ctx.fillStyle='#90EE90'; ctx.fill();}});
    
    renderableCircles.forEach(c => { 
        if (c?.position && typeof c.radius === 'number' && c.radius > 0 && typeof c.player_id === 'number') {
            const currentPlayerDataForRender = clientIdentity ? players.get(clientIdentity.toHexString()) : null;
            const isOwn = currentPlayerDataForRender && typeof currentPlayerDataForRender.player_id === 'number' && currentPlayerDataForRender.player_id === c.player_id;
            
            ctx.beginPath(); ctx.arc(c.position.x, c.position.y, c.radius, 0, 2*Math.PI);
            
            let ownerPlayerForName: Player | undefined; players.forEach(pCheck => { if (pCheck.player_id === c.player_id) ownerPlayerForName = pCheck; });
            const isOwnerAlive = ownerPlayerForName ? renderableCircles.some(rc => rc.player_id === ownerPlayerForName!.player_id) : false;

            // --- MODIFIED: Circle Color Logic ---
            let fillColor: string;
            let strokeColor: string;

            if (isOwn && gamePhase === 'playing') { // Apply skin only to own circles when playing
                switch (playerSkin) {
                    case 'pink':
                        fillColor = '#FFC0CB'; // Pink
                        strokeColor = '#E75480'; // Darker/Saturated Pink
                        break;
                    case 'rainbow':
                        const hue = (performance.now() / 20) % 360; // Cycle hue every ~7 seconds
                        fillColor = `hsl(${hue}, 100%, 70%)`;
                        strokeColor = `hsl(${hue}, 80%, 50%)`; // Darker, slightly less saturated version
                        break;
                    case 'none':
                    default:
                        fillColor = '#3498db'; // Default blue for own player
                        strokeColor = '#2980b9'; // Default dark blue stroke
                        break;
                }
            } else { // Other players or not in 'playing' phase for self
                fillColor = isOwnerAlive ? '#e74c3c' : '#7f8c8d'; // Default red for others, gray for dead/unknown
                strokeColor = isOwnerAlive ? '#c0392b' : '#606c70'; // Default dark red/gray stroke
            }
            ctx.fillStyle = fillColor;
            ctx.strokeStyle = strokeColor;
            // --- END MODIFIED: Circle Color Logic ---

            ctx.fill();
            ctx.lineWidth=Math.max(1, c.radius/20); 
            ctx.stroke();
            
            if(isOwnerAlive && c.radius>10 && ownerPlayerForName){ 
                ctx.fillStyle='white'; ctx.textAlign='center'; ctx.textBaseline='middle'; 
                const fs=Math.max(8,Math.min(24,c.radius/2.8)); ctx.font=`bold ${fs}px Arial`; 
                ctx.shadowColor='black'; ctx.shadowBlur=3; ctx.shadowOffsetX=1; ctx.shadowOffsetY=1; 
                ctx.fillText(ownerPlayerForName.name||"P",c.position.x,c.position.y); 
                ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; 
            }
      }
    });
    ctx.restore();

    // HUD and Death Screen (unchanged logic)
    if(currentPlayer){ ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(5,5,200,70); ctx.fillStyle='white'; ctx.font='16px Arial'; ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(`Name: ${currentPlayer.name||"P"}`,10,10); ctx.fillText(`Mass: ${currentPlayerTotalMass.toFixed(0)}`,10,30); ctx.fillText(`Skin: ${playerSkin}`, 10, 50); /* Added skin to HUD */ }
    if(gamePhase==='dead'){ ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='white'; ctx.textAlign='center'; ctx.font='48px Arial'; ctx.fillText('You Died!',canvas.width/2,canvas.height/2-40); ctx.font='24px Arial'; ctx.fillText(`Final Mass: ${currentPlayerTotalMass.toFixed(0)}`,canvas.width/2,canvas.height/2+10); }

  }, [gamePhase, renderableCircles, renderableFoodItems, players, gameConfig, clientIdentity, isConnected, connectionError, canvasRef, entities, playerSkin]); // Added playerSkin to dependencies

  return (
    <div className="App">
      {gamePhase === 'connecting' && <div className="modal"><h1>Connecting to SpacetimeDB...</h1></div>}
      {gamePhase === 'wallet_connect' && (
        <div className="modal wallet-modal">
          <h1>Connect Your Aptos Wallet</h1>
          {!isPetraWalletInstalled && <p style={{color: 'orange'}}>Aptos standard wallet (e.g., Petra) not detected.</p>}
          <button onClick={handleConnectWallet} disabled={!isPetraWalletInstalled}>Connect Wallet</button>
          {walletError && <p style={{color: 'red'}}>{walletError}</p>}
          {aptosWalletAddress && <p>Connected: {aptosWalletAddress.substring(0,6)}...{aptosWalletAddress.substring(aptosWalletAddress.length - 4)}</p>}
           {PLAYER_SKIN_MODULE_ADDRESS === "0xYOUR_ACCOUNT_ADDRESS_THAT_DEPLOYED_THE_MODULE" && 
            <p style={{color: 'orange', marginTop: '10px'}}>Note: Player skin feature disabled. <br/>Admin: Set `PLAYER_SKIN_MODULE_ADDRESS` in App.tsx.</p>
          }
        </div>
      )}
      {gamePhase === 'login' && !connectionError && aptosWalletAddress && (
        <div className="modal login-modal">
          <h1>Enter Game</h1>
          <p>Wallet: {aptosWalletAddress.substring(0,6)}...{aptosWalletAddress.substring(aptosWalletAddress.length - 4)} (Skin: {playerSkin})</p>
          <form onSubmit={handleEnterGame}>
            <input type="text" value={playerNameInput} onChange={(e) => setPlayerNameInput(e.target.value)} placeholder="Enter your name" required autoFocus maxLength={20}/>
            <button type="submit" disabled={!playerNameInput.trim()}>Join Game</button>
          </form>
        </div>
      )}
      {connectionError && (gamePhase === 'connecting' || gamePhase === 'loading_data' || gamePhase === 'login' || gamePhase === 'wallet_connect') && (
        <div className="modal error-modal"><h1>Connection Issue</h1><p>{connectionError}</p><p>Ensure SpacetimeDB server is running.</p></div>
      )}
      {(gamePhase === 'loading_data' || gamePhase === 'playing' || gamePhase === 'dead') && (
        <>
          <div className="game-container"><canvas ref={canvasRef} width={Math.max(320, window.innerWidth * 0.9)} height={Math.max(240, window.innerHeight * 0.8)}/></div>
          <div className="controls">
            {gamePhase === 'playing' && (<><button onClick={handleSplit}>Split (Space)</button><button onClick={handleSuicide}>Suicide</button></>)}
            {gamePhase === 'dead' && (<button onClick={handleRespawn}>Respawn</button>)}
          </div>
        </>
      )}
      <div className="debug-info">
        <p>Phase: {gamePhase} | SDB Conn: {isConnected.toString()} | SubsDone: {areAllSubscriptionsApplied.toString()}</p>
        {clientIdentity && <p>SDB Identity: {clientIdentity.toHexString().substring(0,10)}...</p>}
        {aptosWalletAddress && <p>Aptos Addr: {aptosWalletAddress.substring(0,6)}...{aptosWalletAddress.substring(aptosWalletAddress.length-4)} (Skin: {playerSkin})</p>}
        {gameConfig && <p>World: {gameConfig.world_size ? Number(gameConfig.world_size) : "N/A"} | Food Target: {TARGET_FOOD_COUNT}</p>}
        <p>P: {players.size}, C(tbl): {circlesInTable.length}, C(rndr): {renderableCircles.length}, F(rndr): {renderableFoodItems.length}, E: {entities.size}</p>
        {connectionError && <p style={{color: 'red'}}>SDB Error: {connectionError}</p>}
        {walletError && <p style={{color: 'red'}}>Wallet Error: {walletError}</p>}
        {PLAYER_SKIN_MODULE_ADDRESS === "0xYOUR_ACCOUNT_ADDRESS_THAT_DEPLOYED_THE_MODULE" && 
            <p style={{color: 'orange'}}>Player skin checks disabled: PLAYER_SKIN_MODULE_ADDRESS not set in App.tsx.</p>
        }
      </div>
    </div>
  );
}

export default App;