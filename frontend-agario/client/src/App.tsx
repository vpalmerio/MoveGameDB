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
  // Reducer arg types if directly used (UpdatePlayerInput is used by SDK)
} from "../../../spacetime-agario/client/src/module_bindings";
import type {
  EventContext,
  ErrorContext
} from "../../../spacetime-agario/client/src/module_bindings";

import { Identity } from '@clockworklabs/spacetimedb-sdk';

const SPACETIMEDB_URI = 'ws://localhost:3000';
const MODULE_NAME = 'spacetime-agario';
const TARGET_FOOD_COUNT = 600; // From your lib.rs for game phase logic

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

// --- Custom Hooks (use the full versions from the previous correct response) ---
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
    const loadInitialData = () => { if (conn?.db?.player && typeof conn.db.player.iter === 'function') { try { const all = Array.from(conn.db.player.iter()); console.log("[usePlayers] Initial:", all.map(p=>({...p, identity:p.identity.toHexString()}))); setPlayersMap(new Map(all.map(p => [p.identity.toHexString(), p]))); } catch (e) { console.error("[usePlayers] Error iter:", e); } } else { console.warn("[usePlayers] No .iter()"); }}; loadInitialData();
    const onInsert = (_ctx: EventContext, p: Player) => { console.log("[usePlayers] Insert:", {...p, identity:p.identity.toHexString()}); setPlayersMap(prev => new Map(prev).set(p.identity.toHexString(), p)); }; conn.db.player.onInsert(onInsert);
    const onUpdate = (_ctx: EventContext, _o: Player, n: Player) => { console.log("[usePlayers] Update:", {...n, identity:n.identity.toHexString()}); setPlayersMap(prev => new Map(prev).set(n.identity.toHexString(), n)); }; conn.db.player.onUpdate(onUpdate);
    const onDelete = (_ctx: EventContext, p: Player) => { console.log("[usePlayers] Delete:", {...p, identity:p.identity.toHexString()}); setPlayersMap(prev => { const next = new Map(prev); next.delete(p.identity.toHexString()); return next; }); }; conn.db.player.onDelete(onDelete);
    return () => { if (conn?.db?.player) { conn.db.player.removeOnInsert(onInsert); conn.db.player.removeOnUpdate(onUpdate); conn.db.player.removeOnDelete(onDelete); }};
  }, [conn]);
  return playersMap;
}

function useCirclesInTable(conn: DbConnection | null): CircleTableEntry[] {
  const [circlesArr, setCirclesArr] = useState<CircleTableEntry[]>([]);
  useEffect(() => {
    if (!conn?.db?.circle) { setCirclesArr([]); return; }
    const loadInitialData = () => { if (conn?.db?.circle && typeof conn.db.circle.iter === 'function') { try { const all = Array.from(conn.db.circle.iter()); setCirclesArr(all); } catch (e) { console.error("[useCirclesInTable] Error iter:", e); } } else { console.warn("[useCirclesInTable] No .iter()"); }}; loadInitialData();
    const eq = (c1: CircleTableEntry, c2: CircleTableEntry) => c1.entityId === c2.entityId;
    const onInsert = (_ctx: EventContext, c: CircleTableEntry) => setCirclesArr(prev => [...prev, c]); conn.db.circle.onInsert(onInsert);
    const onUpdate = (_ctx: EventContext, _o: CircleTableEntry, n: CircleTableEntry) => setCirclesArr(prev => prev.map(c => eq(c, n) ? n : c)); conn.db.circle.onUpdate(onUpdate);
    const onDelete = (_ctx: EventContext, c: CircleTableEntry) => setCirclesArr(prev => prev.filter(el => !eq(el, c))); conn.db.circle.onDelete(onDelete);
    return () => { if (conn?.db?.circle) { conn.db.circle.removeOnInsert(onInsert); conn.db.circle.removeOnUpdate(onUpdate); conn.db.circle.removeOnDelete(onDelete); }};
  }, [conn]);
  return circlesArr;
}

function useFood(conn: DbConnection | null, allEntities: Map<number, ServerEntity>): RenderableFood[] {
  const [renderableFood, setRenderableFood] = useState<RenderableFood[]>([]);
  const [foodEntityIds, setFoodEntityIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!conn?.db?.food) { setFoodEntityIds(new Set()); return; }
    const loadInitialFoodIds = () => { if (conn?.db?.food && typeof conn.db.food.iter === 'function') { try { const entries = Array.from(conn.db.food.iter()); console.log("[useFood] Initial food IDs:", entries.map(f=>f.entityId)); setFoodEntityIds(new Set(entries.map(f => f.entityId))); } catch (e) { console.error("[useFood] Error iter IDs:", e); } } else { console.warn("[useFood] No .iter() for IDs");}}; loadInitialFoodIds();
    const onFoodInsert = (_ctx: EventContext, fe: FoodTableEntry) => { console.log(`[useFood] Food ID Insert: ${fe.entityId}`); setFoodEntityIds(prev => new Set(prev).add(fe.entityId)); }; conn.db.food.onInsert(onFoodInsert);
    const onFoodDelete = (_ctx: EventContext, fe: FoodTableEntry) => { console.log(`[useFood] Food ID Delete: ${fe.entityId}`); setFoodEntityIds(prev => { const next = new Set(prev); next.delete(fe.entityId); return next; }); }; conn.db.food.onDelete(onFoodDelete);
    return () => { if (conn?.db?.food) { conn.db.food.removeOnInsert(onFoodInsert); conn.db.food.removeOnDelete(onFoodDelete); }};
  }, [conn]);
  useEffect(() => {
    const newRenderable: RenderableFood[] = [];
    for (const id of foodEntityIds) {
      const entity = allEntities.get(id);
      if (entity?.position && typeof entity.mass === 'number') { newRenderable.push({ entityId: id, position: entity.position, mass: entity.mass, radius: massToRadius(entity.mass) });
      } else if (entity) { console.warn(`[useFood] Entity for food ID ${id} missing pos/mass:`, entity); }
    }
    setRenderableFood(newRenderable);
  }, [foodEntityIds, allEntities]);
  return renderableFood;
}

function useConfig(conn: DbConnection | null): Config | null {
  const [configState, setConfigState] = useState<Config | null>(null);
  useEffect(() => {
    if (!conn?.db?.config) { setConfigState(null); return; }
    const loadInitialData = () => { if (conn?.db?.config && typeof conn.db.config.iter === 'function') { try { const all = Array.from(conn.db.config.iter()); if (all.length > 0) { console.log("[useConfig] Initial:", {...all[0]}); setConfigState(all[0]); } else { console.warn("[useConfig] No config.");} } catch (e) { console.error("[useConfig] Error iter:", e); } } else { console.warn("[useConfig] No .iter()");}}; loadInitialData();
    const onChange = (_ctx: EventContext, nc: Config) => setConfigState(nc); conn.db.config.onInsert(onChange); conn.db.config.onUpdate((ctx, _o,n)=>onChange(ctx,n));
    return () => { if (conn?.db?.config) { conn.db.config.removeOnInsert(onChange); conn.db.config.removeOnUpdate((ctx,_o,n)=>onChange(ctx,n));}};
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
  type GamePhase = 'connecting' | 'loading_data' | 'login' | 'playing' | 'dead';
  const [gamePhase, setGamePhase] = useState<GamePhase>('connecting');
  const [playerNameInput, setPlayerNameInput] = useState('');

  const entities = useEntities(dbConn);
  const players = usePlayers(dbConn);
  const circlesInTable = useCirclesInTable(dbConn);
  const renderableFoodItems = useFood(dbConn, entities);
  const gameConfig = useConfig(dbConn);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderableCircles = React.useMemo(() => {
    return circlesInTable.map(circleEntry => {
        const entityData = entities.get(circleEntry.entityId);
        if (entityData?.position && typeof entityData.mass === 'number') {
            return {
                ...circleEntry,
                position: entityData.position,
                mass: entityData.mass,
                radius: massToRadius(entityData.mass),
            } as RenderableCircle;
        }
        return null;
    }).filter(Boolean) as RenderableCircle[];
  }, [circlesInTable, entities]);

  useEffect(() => { // SpacetimeDB Connection
    console.log(`Effect for DB Connection setup is running.`);
    let isCancelled = false;
    const onConnectHandler = (connInst: DbConnection, identity: Identity, token: string) => {
      if (isCancelled) return;
      console.log('Connected to SpacetimeDB with identity:', identity.toHexString());
      localStorage.setItem('spacetimedb_auth_token', token);
      setClientIdentity(identity); setIsConnected(true); setConnectionError(null); setAreAllSubscriptionsApplied(false);
      const queries = ['SELECT * FROM player', 'SELECT * FROM circle', 'SELECT * FROM food', 'SELECT * FROM config', 'SELECT * FROM entity'];
      let subscribedCount = 0;
      if (!connInst?.db) { if (!isCancelled) { setConnectionError("DB instance not ready for subs."); setGamePhase('connecting'); } return; }
      queries.forEach(query => connInst.subscriptionBuilder().onApplied(() => {
        if (isCancelled) return; subscribedCount++;
        if (subscribedCount === queries.length) { console.log('All subscriptions applied.'); if (!isCancelled) setAreAllSubscriptionsApplied(true); }
      }).onError((_errCtx, errMsg) => { if (isCancelled) return; console.error(`Sub error ${query}:`, errMsg); if (!isCancelled) setConnectionError(`Sub failed: ${errMsg}`); }).subscribe(query));
    };
    const onDisconnectHandler = () => { if (isCancelled) return; console.log('Disconnected'); setIsConnected(false); setClientIdentity(null); setAreAllSubscriptionsApplied(false); if (!isCancelled) setGamePhase('connecting'); };
    const onConnectErrorHandler = (_ctx: ErrorContext | null, err: Error | string) => { if (isCancelled) return; const msg = typeof err === 'string' ? err : (err.message || "Unknown conn error"); console.error('Connect Error:', msg, err); if (!isCancelled) { setConnectionError(msg); setGamePhase('connecting'); }};
    
    console.log(`Attempting connect: ${SPACETIMEDB_URI}, Module: ${MODULE_NAME}`);
    const authToken = localStorage.getItem('spacetimedb_auth_token');
    const newConnection = DbConnection.builder().withUri(SPACETIMEDB_URI).withModuleName(MODULE_NAME).withToken(authToken || undefined).onConnect(onConnectHandler).onDisconnect(onDisconnectHandler).onConnectError(onConnectErrorHandler).build();
    if (!isCancelled) setDbConn(newConnection);
    return () => { isCancelled = true; console.log("Cleanup: Disconnecting."); newConnection?.disconnect(); };
  }, []);

  useEffect(() => { // Determine game phase
    const currentIdentity = clientIdentity;
    const currentPlayer = currentIdentity ? players.get(currentIdentity.toHexString()) : null;
    let newPhase = gamePhase;

    if (!isConnected) newPhase = 'connecting';
    else if (!currentIdentity || !areAllSubscriptionsApplied || !gameConfig || !dbConn || (entities.size === 0 && (gameConfig.initialFoodCount || TARGET_FOOD_COUNT) > 0 && gamePhase !== 'login' && gamePhase !== 'playing' && gamePhase !== 'dead') ) { // Added more conditions to allow login even if entities are 0
        newPhase = 'loading_data';
    }
    else if (currentPlayer) {
        const playerOwnedRenderableCircles = renderableCircles.filter(c => c.player_id === currentPlayer.player_id);
        const isAlive = playerOwnedRenderableCircles.length > 0;
        newPhase = isAlive ? 'playing' : 'dead';
        if (isAlive) {
            // console.log(`Player ${currentPlayer.name} is ALIVE with ${playerOwnedRenderableCircles.length} circles.`);
        } else {
            // console.log(`Player ${currentPlayer.name} is DEAD.`);
        }
    }
    else newPhase = 'login';

    if (newPhase !== gamePhase) {
      console.log(`Game phase changing from ${gamePhase} to ${newPhase}. Player:`, currentPlayer ? {...currentPlayer, identity: currentPlayer.identity.toHexString()} : null);
      setGamePhase(newPhase);
    }
  }, [isConnected, clientIdentity, players, areAllSubscriptionsApplied, gameConfig, dbConn, gamePhase, renderableCircles, entities]);

  const handleEnterGame = useCallback((e: React.FormEvent) => { e.preventDefault(); if (dbConn?.reducers && playerNameInput.trim() && (gamePhase === 'login' || gamePhase === 'loading_data')) { dbConn.reducers.enter_game(playerNameInput.trim()); } }, [dbConn, playerNameInput, gamePhase]);
  const handleRespawn = useCallback(() => { if (dbConn?.reducers && gamePhase === 'dead') { dbConn.reducers.respawn(); } }, [dbConn, gamePhase]);
  const handleSplit = useCallback(() => { if (dbConn?.reducers && gamePhase === 'playing') { dbConn.reducers.player_split(); } }, [dbConn, gamePhase]);
  const handleSuicide = useCallback(() => { if (dbConn?.reducers && gamePhase === 'playing') { dbConn.reducers.suicide(); } }, [dbConn, gamePhase]);

  useEffect(() => { // Mouse move
    if (gamePhase !== 'playing' || !dbConn?.reducers || !canvasRef.current || !gameConfig) return;
    const canvas = canvasRef.current;
    const fullHandleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect(); const midX = canvas.width / 2; const midY = canvas.height / 2;
      let dx = event.clientX - rect.left - midX; let dy = event.clientY - rect.top - midY;
      const mag = Math.sqrt(dx * dx + dy * dy); if (mag < 1) { // Send (0,0) if mouse is at center or very close
        // Optional: only send if different from last, or always send to indicate holding still
        // dbConn.reducers.updatePlayerInput({ x: 0, y: 0 } as DbVector2);
        return; // Current behavior: don't send if too small (effectively stops when mouse is near center)
      }
      dx /= mag; dy /= mag;
      // CORRECTED: Use camelCase for reducer method
      dbConn.reducers.updatePlayerInput({ x: dx, y: dy } as DbVector2);
    };
    window.addEventListener('mousemove', fullHandleMouseMove);
    return () => window.removeEventListener('mousemove', fullHandleMouseMove);
  }, [gamePhase, dbConn, gameConfig]);

  useEffect(() => { // Keyboard for Split
    const handleKeyDown = (event: KeyboardEvent) => { if (event.code === 'Space' || event.key === ' ') { event.preventDefault(); handleSplit(); }};
    if (gamePhase === 'playing') { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }
  }, [gamePhase, handleSplit]);

  // Canvas Rendering useEffect (ensure it's the full version from previous response, with corrected variable names)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const world_size_cfg = gameConfig?.world_size ? Number(gameConfig.world_size) : 1000;

    const renderErrorOrLoading = (message: string) => {
        ctx.fillStyle = '#333'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '24px Arial';
        if (connectionError) {
            ctx.fillText(`Error: ${connectionError}`, canvas.width/2, canvas.height/2 - 20);
            ctx.font = '16px Arial'; ctx.fillText(`Check console. Server running?`, canvas.width/2, canvas.height/2 + 20);
        } else { ctx.fillText(message, canvas.width/2, canvas.height/2); }
    };

    if (!gameConfig || !isConnected) { renderErrorOrLoading(isConnected ? 'Loading Config...' : 'Connecting...'); return; }
    if (gamePhase === 'loading_data') { renderErrorOrLoading('Loading Game Data...'); return; }

    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let camX = world_size_cfg / 2; let camY = world_size_cfg / 2;
    const currentPlayer = clientIdentity ? players.get(clientIdentity.toHexString()) : null;
    
    let currentPlayerTotalMass = 0;
    if (currentPlayer && (gamePhase === 'playing' || gamePhase === 'dead')) { // Calculate for playing and for final mass on death
        const playerOwnedRenderableCircles = renderableCircles.filter(c => c.player_id === currentPlayer.player_id);
        playerOwnedRenderableCircles.forEach(c => { if (c.mass) currentPlayerTotalMass += c.mass; });

        if (gamePhase === 'playing' && playerOwnedRenderableCircles.length > 0) {
            let xSum = 0, ySum = 0, mSumForCamera = 0; // Use mSumForCamera to avoid conflict if currentPlayerTotalMass is used differently
            playerOwnedRenderableCircles.forEach(c => { if (c.position && c.mass) { xSum += c.position.x * c.mass; ySum += c.position.y * c.mass; mSumForCamera += c.mass;}});
            if (mSumForCamera > 0) { camX = xSum / mSumForCamera; camY = ySum / mSumForCamera; }
        }
    }

    ctx.save(); ctx.translate(canvas.width/2 - camX, canvas.height/2 - camY);
    ctx.strokeStyle = '#444'; ctx.lineWidth = Math.max(5, world_size_cfg/200); ctx.strokeRect(0,0,world_size_cfg, world_size_cfg);

    renderableFoodItems.forEach(f => { if (f?.position && f.radius) { ctx.beginPath(); ctx.arc(f.position.x, f.position.y, f.radius, 0, 2*Math.PI); ctx.fillStyle='#90EE90'; ctx.fill();}});
    
    renderableCircles.forEach(c => {
      if (c?.position && c.radius && typeof c.player_id === 'number') {
        ctx.beginPath(); ctx.arc(c.position.x, c.position.y, c.radius, 0, 2*Math.PI);
        let ownerPlayerForName: Player | undefined;
        players.forEach(pCheck => { if (pCheck.player_id === c.player_id) ownerPlayerForName = pCheck; });
        const isOwn = currentPlayer?.player_id === c.player_id;
        const isOwnerAlive = ownerPlayerForName ? renderableCircles.some(rc => rc.player_id === ownerPlayerForName!.player_id) : false;

        ctx.fillStyle = isOwn?'#3498db':(isOwnerAlive?'#e74c3c':'#7f8c8d'); ctx.fill();
        ctx.strokeStyle = isOwn?'#2980b9':(isOwnerAlive?'#c0392b':'#606c70'); ctx.lineWidth=Math.max(1,c.radius/20); ctx.stroke();
        if(isOwnerAlive && c.radius>10 && ownerPlayerForName){ctx.fillStyle='white';ctx.textAlign='center';ctx.textBaseline='middle';const fs=Math.max(8,Math.min(24,c.radius/2.8));ctx.font=`bold ${fs}px Arial`;ctx.shadowColor='black';ctx.shadowBlur=3;ctx.shadowOffsetX=1;ctx.shadowOffsetY=1;ctx.fillText(ownerPlayerForName.name||"P",c.position.x,c.position.y);ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;}
      }
    });
    ctx.restore();

    if(currentPlayer){ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(5,5,200,50);ctx.fillStyle='white';ctx.font='16px Arial';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(`Name: ${currentPlayer.name||"P"}`,10,10);ctx.fillText(`Mass: ${currentPlayerTotalMass.toFixed(0)}`,10,30);}
    if(gamePhase==='dead'){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='white';ctx.textAlign='center';ctx.font='48px Arial';ctx.fillText('You Died!',canvas.width/2,canvas.height/2-40);ctx.font='24px Arial';ctx.fillText(`Final Mass: ${currentPlayerTotalMass.toFixed(0)}`,canvas.width/2,canvas.height/2+10);}
  }, [gamePhase, renderableCircles, renderableFoodItems, players, gameConfig, clientIdentity, isConnected, connectionError, canvasRef, entities]);

  return (
    <div className="App">
      {gamePhase === 'login' && !connectionError && (
        <div className="modal login-modal">
          <h1>Enter Game</h1>
          <form onSubmit={handleEnterGame}>
            <input
              type="text"
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              placeholder="Enter your name"
              required
              autoFocus
              maxLength={20}
            />
            <button type="submit" disabled={!playerNameInput.trim()}>
              Join Game
            </button>
          </form>
        </div>
      )}
      {connectionError && (gamePhase === 'connecting' || gamePhase === 'login' || gamePhase === 'loading_data') && (
        <div className="modal error-modal">
          <h1>Connection Issue</h1>
          <p>{connectionError}</p>
          <p>Ensure server is running.</p>
        </div>
      )}
      <div className="game-container">
        <canvas
          ref={canvasRef}
          width={Math.max(320, window.innerWidth * 0.9)}
          height={Math.max(240, window.innerHeight * 0.8)}
        />
      </div>
      <div className="controls">
        {gamePhase === 'playing' && (
          <>
            <button onClick={handleSplit}>Split (Space)</button>
            <button onClick={handleSuicide}>Suicide</button>
          </>
        )}
        {gamePhase === 'dead' && (
          <button onClick={handleRespawn}>Respawn</button>
        )}
      </div>
      <div className="debug-info">
        <p>Phase: {gamePhase} | Conn: {isConnected.toString()} | SubsDone: {areAllSubscriptionsApplied.toString()}</p>
        {clientIdentity && <p>Identity: {clientIdentity.toHexString().substring(0,10)}...</p>}
        {gameConfig && <p>World: {gameConfig.world_size ? Number(gameConfig.world_size) : "N/A"} | InitialFood(server): { (gameConfig as any).initialFoodCount || TARGET_FOOD_COUNT}</p>}
        <p>P: {players.size}, C(tbl): {circlesInTable.length}, C(rndr): {renderableCircles.length}, F(rndr): {renderableFoodItems.length}, E: {entities.size}</p>
        {connectionError && <p style={{color: 'red'}}>Error: {connectionError}</p>}
      </div>
    </div>
  );
}

export default App;