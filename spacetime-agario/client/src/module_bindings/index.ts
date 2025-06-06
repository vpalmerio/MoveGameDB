// THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB. EDITS TO THIS FILE
// WILL NOT BE SAVED. MODIFY TABLES IN YOUR MODULE SOURCE CODE INSTEAD.

/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
import {
  AlgebraicType,
  AlgebraicValue,
  BinaryReader,
  BinaryWriter,
  CallReducerFlags,
  ConnectionId,
  DbConnectionBuilder,
  DbConnectionImpl,
  DbContext,
  ErrorContextInterface,
  Event,
  EventContextInterface,
  Identity,
  ProductType,
  ProductTypeElement,
  ReducerEventContextInterface,
  SubscriptionBuilderImpl,
  SubscriptionEventContextInterface,
  SumType,
  SumTypeVariant,
  TableCache,
  TimeDuration,
  Timestamp,
  deepEqual,
} from "@clockworklabs/spacetimedb-sdk";

// Import and reexport all reducer arg types
import { CircleDecay } from "./circle_decay_reducer.ts";
export { CircleDecay };
import { CircleRecombine } from "./circle_recombine_reducer.ts";
export { CircleRecombine };
import { Connect } from "./connect_reducer.ts";
export { Connect };
import { ConsumeEntity } from "./consume_entity_reducer.ts";
export { ConsumeEntity };
import { Disconnect } from "./disconnect_reducer.ts";
export { Disconnect };
import { EnterGame } from "./enter_game_reducer.ts";
export { EnterGame };
import { MoveAllPlayers } from "./move_all_players_reducer.ts";
export { MoveAllPlayers };
import { PlayerSplit } from "./player_split_reducer.ts";
export { PlayerSplit };
import { Respawn } from "./respawn_reducer.ts";
export { Respawn };
import { SpawnFood } from "./spawn_food_reducer.ts";
export { SpawnFood };
import { Suicide } from "./suicide_reducer.ts";
export { Suicide };
import { UpdatePlayerInput } from "./update_player_input_reducer.ts";
export { UpdatePlayerInput };

// Import and reexport all table handle types
import { CircleTableHandle } from "./circle_table.ts";
export { CircleTableHandle };
import { CircleDecayTimerTableHandle } from "./circle_decay_timer_table.ts";
export { CircleDecayTimerTableHandle };
import { CircleRecombineTimerTableHandle } from "./circle_recombine_timer_table.ts";
export { CircleRecombineTimerTableHandle };
import { ConfigTableHandle } from "./config_table.ts";
export { ConfigTableHandle };
import { ConsumeEntityTimerTableHandle } from "./consume_entity_timer_table.ts";
export { ConsumeEntityTimerTableHandle };
import { EntityTableHandle } from "./entity_table.ts";
export { EntityTableHandle };
import { FoodTableHandle } from "./food_table.ts";
export { FoodTableHandle };
import { LoggedOutPlayerTableHandle } from "./logged_out_player_table.ts";
export { LoggedOutPlayerTableHandle };
import { MoveAllPlayersTimerTableHandle } from "./move_all_players_timer_table.ts";
export { MoveAllPlayersTimerTableHandle };
import { PlayerTableHandle } from "./player_table.ts";
export { PlayerTableHandle };
import { SpawnFoodTimerTableHandle } from "./spawn_food_timer_table.ts";
export { SpawnFoodTimerTableHandle };

// Import and reexport all types
import { Circle } from "./circle_type.ts";
export { Circle };
import { CircleDecayTimer } from "./circle_decay_timer_type.ts";
export { CircleDecayTimer };
import { CircleRecombineTimer } from "./circle_recombine_timer_type.ts";
export { CircleRecombineTimer };
import { Config } from "./config_type.ts";
export { Config };
import { ConsumeEntityTimer } from "./consume_entity_timer_type.ts";
export { ConsumeEntityTimer };
import { DbVector2 } from "./db_vector_2_type.ts";
export { DbVector2 };
import { Entity } from "./entity_type.ts";
export { Entity };
import { Food } from "./food_type.ts";
export { Food };
import { MoveAllPlayersTimer } from "./move_all_players_timer_type.ts";
export { MoveAllPlayersTimer };
import { Player } from "./player_type.ts";
export { Player };
import { SpawnFoodTimer } from "./spawn_food_timer_type.ts";
export { SpawnFoodTimer };

const REMOTE_MODULE = {
  tables: {
    circle: {
      tableName: "circle",
      rowType: Circle.getTypeScriptAlgebraicType(),
      primaryKey: "entityId",
    },
    circle_decay_timer: {
      tableName: "circle_decay_timer",
      rowType: CircleDecayTimer.getTypeScriptAlgebraicType(),
      primaryKey: "scheduledId",
    },
    circle_recombine_timer: {
      tableName: "circle_recombine_timer",
      rowType: CircleRecombineTimer.getTypeScriptAlgebraicType(),
      primaryKey: "scheduledId",
    },
    config: {
      tableName: "config",
      rowType: Config.getTypeScriptAlgebraicType(),
      primaryKey: "id",
    },
    consume_entity_timer: {
      tableName: "consume_entity_timer",
      rowType: ConsumeEntityTimer.getTypeScriptAlgebraicType(),
      primaryKey: "scheduledId",
    },
    entity: {
      tableName: "entity",
      rowType: Entity.getTypeScriptAlgebraicType(),
      primaryKey: "entityId",
    },
    food: {
      tableName: "food",
      rowType: Food.getTypeScriptAlgebraicType(),
      primaryKey: "entityId",
    },
    logged_out_player: {
      tableName: "logged_out_player",
      rowType: Player.getTypeScriptAlgebraicType(),
      primaryKey: "identity",
    },
    move_all_players_timer: {
      tableName: "move_all_players_timer",
      rowType: MoveAllPlayersTimer.getTypeScriptAlgebraicType(),
      primaryKey: "scheduledId",
    },
    player: {
      tableName: "player",
      rowType: Player.getTypeScriptAlgebraicType(),
      primaryKey: "identity",
    },
    spawn_food_timer: {
      tableName: "spawn_food_timer",
      rowType: SpawnFoodTimer.getTypeScriptAlgebraicType(),
      primaryKey: "scheduledId",
    },
  },
  reducers: {
    circle_decay: {
      reducerName: "circle_decay",
      argsType: CircleDecay.getTypeScriptAlgebraicType(),
    },
    circle_recombine: {
      reducerName: "circle_recombine",
      argsType: CircleRecombine.getTypeScriptAlgebraicType(),
    },
    connect: {
      reducerName: "connect",
      argsType: Connect.getTypeScriptAlgebraicType(),
    },
    consume_entity: {
      reducerName: "consume_entity",
      argsType: ConsumeEntity.getTypeScriptAlgebraicType(),
    },
    disconnect: {
      reducerName: "disconnect",
      argsType: Disconnect.getTypeScriptAlgebraicType(),
    },
    enter_game: {
      reducerName: "enter_game",
      argsType: EnterGame.getTypeScriptAlgebraicType(),
    },
    move_all_players: {
      reducerName: "move_all_players",
      argsType: MoveAllPlayers.getTypeScriptAlgebraicType(),
    },
    player_split: {
      reducerName: "player_split",
      argsType: PlayerSplit.getTypeScriptAlgebraicType(),
    },
    respawn: {
      reducerName: "respawn",
      argsType: Respawn.getTypeScriptAlgebraicType(),
    },
    spawn_food: {
      reducerName: "spawn_food",
      argsType: SpawnFood.getTypeScriptAlgebraicType(),
    },
    suicide: {
      reducerName: "suicide",
      argsType: Suicide.getTypeScriptAlgebraicType(),
    },
    update_player_input: {
      reducerName: "update_player_input",
      argsType: UpdatePlayerInput.getTypeScriptAlgebraicType(),
    },
  },
  // Constructors which are used by the DbConnectionImpl to
  // extract type information from the generated RemoteModule.
  //
  // NOTE: This is not strictly necessary for `eventContextConstructor` because
  // all we do is build a TypeScript object which we could have done inside the
  // SDK, but if in the future we wanted to create a class this would be
  // necessary because classes have methods, so we'll keep it.
  eventContextConstructor: (imp: DbConnectionImpl, event: Event<Reducer>) => {
    return {
      ...(imp as DbConnection),
      event
    }
  },
  dbViewConstructor: (imp: DbConnectionImpl) => {
    return new RemoteTables(imp);
  },
  reducersConstructor: (imp: DbConnectionImpl, setReducerFlags: SetReducerFlags) => {
    return new RemoteReducers(imp, setReducerFlags);
  },
  setReducerFlagsConstructor: () => {
    return new SetReducerFlags();
  }
}

// A type representing all the possible variants of a reducer.
export type Reducer = never
| { name: "CircleDecay", args: CircleDecay }
| { name: "CircleRecombine", args: CircleRecombine }
| { name: "Connect", args: Connect }
| { name: "ConsumeEntity", args: ConsumeEntity }
| { name: "Disconnect", args: Disconnect }
| { name: "EnterGame", args: EnterGame }
| { name: "MoveAllPlayers", args: MoveAllPlayers }
| { name: "PlayerSplit", args: PlayerSplit }
| { name: "Respawn", args: Respawn }
| { name: "SpawnFood", args: SpawnFood }
| { name: "Suicide", args: Suicide }
| { name: "UpdatePlayerInput", args: UpdatePlayerInput }
;

export class RemoteReducers {
  constructor(private connection: DbConnectionImpl, private setCallReducerFlags: SetReducerFlags) {}

  circleDecay(timer: CircleDecayTimer) {
    const __args = { timer };
    let __writer = new BinaryWriter(1024);
    CircleDecay.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("circle_decay", __argsBuffer, this.setCallReducerFlags.circleDecayFlags);
  }

  onCircleDecay(callback: (ctx: ReducerEventContext, timer: CircleDecayTimer) => void) {
    this.connection.onReducer("circle_decay", callback);
  }

  removeOnCircleDecay(callback: (ctx: ReducerEventContext, timer: CircleDecayTimer) => void) {
    this.connection.offReducer("circle_decay", callback);
  }

  circleRecombine(timer: CircleRecombineTimer) {
    const __args = { timer };
    let __writer = new BinaryWriter(1024);
    CircleRecombine.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("circle_recombine", __argsBuffer, this.setCallReducerFlags.circleRecombineFlags);
  }

  onCircleRecombine(callback: (ctx: ReducerEventContext, timer: CircleRecombineTimer) => void) {
    this.connection.onReducer("circle_recombine", callback);
  }

  removeOnCircleRecombine(callback: (ctx: ReducerEventContext, timer: CircleRecombineTimer) => void) {
    this.connection.offReducer("circle_recombine", callback);
  }

  onConnect(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("connect", callback);
  }

  removeOnConnect(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("connect", callback);
  }

  consumeEntity(request: ConsumeEntityTimer) {
    const __args = { request };
    let __writer = new BinaryWriter(1024);
    ConsumeEntity.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("consume_entity", __argsBuffer, this.setCallReducerFlags.consumeEntityFlags);
  }

  onConsumeEntity(callback: (ctx: ReducerEventContext, request: ConsumeEntityTimer) => void) {
    this.connection.onReducer("consume_entity", callback);
  }

  removeOnConsumeEntity(callback: (ctx: ReducerEventContext, request: ConsumeEntityTimer) => void) {
    this.connection.offReducer("consume_entity", callback);
  }

  onDisconnect(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("disconnect", callback);
  }

  removeOnDisconnect(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("disconnect", callback);
  }

  enterGame(name: string, aptosAddress: string) {
    const __args = { name, aptosAddress };
    let __writer = new BinaryWriter(1024);
    EnterGame.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("enter_game", __argsBuffer, this.setCallReducerFlags.enterGameFlags);
  }

  onEnterGame(callback: (ctx: ReducerEventContext, name: string, aptosAddress: string) => void) {
    this.connection.onReducer("enter_game", callback);
  }

  removeOnEnterGame(callback: (ctx: ReducerEventContext, name: string, aptosAddress: string) => void) {
    this.connection.offReducer("enter_game", callback);
  }

  moveAllPlayers(timer: MoveAllPlayersTimer) {
    const __args = { timer };
    let __writer = new BinaryWriter(1024);
    MoveAllPlayers.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("move_all_players", __argsBuffer, this.setCallReducerFlags.moveAllPlayersFlags);
  }

  onMoveAllPlayers(callback: (ctx: ReducerEventContext, timer: MoveAllPlayersTimer) => void) {
    this.connection.onReducer("move_all_players", callback);
  }

  removeOnMoveAllPlayers(callback: (ctx: ReducerEventContext, timer: MoveAllPlayersTimer) => void) {
    this.connection.offReducer("move_all_players", callback);
  }

  playerSplit() {
    this.connection.callReducer("player_split", new Uint8Array(0), this.setCallReducerFlags.playerSplitFlags);
  }

  onPlayerSplit(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("player_split", callback);
  }

  removeOnPlayerSplit(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("player_split", callback);
  }

  respawn() {
    this.connection.callReducer("respawn", new Uint8Array(0), this.setCallReducerFlags.respawnFlags);
  }

  onRespawn(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("respawn", callback);
  }

  removeOnRespawn(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("respawn", callback);
  }

  spawnFood(timer: SpawnFoodTimer) {
    const __args = { timer };
    let __writer = new BinaryWriter(1024);
    SpawnFood.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("spawn_food", __argsBuffer, this.setCallReducerFlags.spawnFoodFlags);
  }

  onSpawnFood(callback: (ctx: ReducerEventContext, timer: SpawnFoodTimer) => void) {
    this.connection.onReducer("spawn_food", callback);
  }

  removeOnSpawnFood(callback: (ctx: ReducerEventContext, timer: SpawnFoodTimer) => void) {
    this.connection.offReducer("spawn_food", callback);
  }

  suicide() {
    this.connection.callReducer("suicide", new Uint8Array(0), this.setCallReducerFlags.suicideFlags);
  }

  onSuicide(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("suicide", callback);
  }

  removeOnSuicide(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("suicide", callback);
  }

  updatePlayerInput(direction: DbVector2) {
    const __args = { direction };
    let __writer = new BinaryWriter(1024);
    UpdatePlayerInput.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("update_player_input", __argsBuffer, this.setCallReducerFlags.updatePlayerInputFlags);
  }

  onUpdatePlayerInput(callback: (ctx: ReducerEventContext, direction: DbVector2) => void) {
    this.connection.onReducer("update_player_input", callback);
  }

  removeOnUpdatePlayerInput(callback: (ctx: ReducerEventContext, direction: DbVector2) => void) {
    this.connection.offReducer("update_player_input", callback);
  }

}

export class SetReducerFlags {
  circleDecayFlags: CallReducerFlags = 'FullUpdate';
  circleDecay(flags: CallReducerFlags) {
    this.circleDecayFlags = flags;
  }

  circleRecombineFlags: CallReducerFlags = 'FullUpdate';
  circleRecombine(flags: CallReducerFlags) {
    this.circleRecombineFlags = flags;
  }

  consumeEntityFlags: CallReducerFlags = 'FullUpdate';
  consumeEntity(flags: CallReducerFlags) {
    this.consumeEntityFlags = flags;
  }

  enterGameFlags: CallReducerFlags = 'FullUpdate';
  enterGame(flags: CallReducerFlags) {
    this.enterGameFlags = flags;
  }

  moveAllPlayersFlags: CallReducerFlags = 'FullUpdate';
  moveAllPlayers(flags: CallReducerFlags) {
    this.moveAllPlayersFlags = flags;
  }

  playerSplitFlags: CallReducerFlags = 'FullUpdate';
  playerSplit(flags: CallReducerFlags) {
    this.playerSplitFlags = flags;
  }

  respawnFlags: CallReducerFlags = 'FullUpdate';
  respawn(flags: CallReducerFlags) {
    this.respawnFlags = flags;
  }

  spawnFoodFlags: CallReducerFlags = 'FullUpdate';
  spawnFood(flags: CallReducerFlags) {
    this.spawnFoodFlags = flags;
  }

  suicideFlags: CallReducerFlags = 'FullUpdate';
  suicide(flags: CallReducerFlags) {
    this.suicideFlags = flags;
  }

  updatePlayerInputFlags: CallReducerFlags = 'FullUpdate';
  updatePlayerInput(flags: CallReducerFlags) {
    this.updatePlayerInputFlags = flags;
  }

}

export class RemoteTables {
  constructor(private connection: DbConnectionImpl) {}

  get circle(): CircleTableHandle {
    return new CircleTableHandle(this.connection.clientCache.getOrCreateTable<Circle>(REMOTE_MODULE.tables.circle));
  }

  get circleDecayTimer(): CircleDecayTimerTableHandle {
    return new CircleDecayTimerTableHandle(this.connection.clientCache.getOrCreateTable<CircleDecayTimer>(REMOTE_MODULE.tables.circle_decay_timer));
  }

  get circleRecombineTimer(): CircleRecombineTimerTableHandle {
    return new CircleRecombineTimerTableHandle(this.connection.clientCache.getOrCreateTable<CircleRecombineTimer>(REMOTE_MODULE.tables.circle_recombine_timer));
  }

  get config(): ConfigTableHandle {
    return new ConfigTableHandle(this.connection.clientCache.getOrCreateTable<Config>(REMOTE_MODULE.tables.config));
  }

  get consumeEntityTimer(): ConsumeEntityTimerTableHandle {
    return new ConsumeEntityTimerTableHandle(this.connection.clientCache.getOrCreateTable<ConsumeEntityTimer>(REMOTE_MODULE.tables.consume_entity_timer));
  }

  get entity(): EntityTableHandle {
    return new EntityTableHandle(this.connection.clientCache.getOrCreateTable<Entity>(REMOTE_MODULE.tables.entity));
  }

  get food(): FoodTableHandle {
    return new FoodTableHandle(this.connection.clientCache.getOrCreateTable<Food>(REMOTE_MODULE.tables.food));
  }

  get loggedOutPlayer(): LoggedOutPlayerTableHandle {
    return new LoggedOutPlayerTableHandle(this.connection.clientCache.getOrCreateTable<Player>(REMOTE_MODULE.tables.logged_out_player));
  }

  get moveAllPlayersTimer(): MoveAllPlayersTimerTableHandle {
    return new MoveAllPlayersTimerTableHandle(this.connection.clientCache.getOrCreateTable<MoveAllPlayersTimer>(REMOTE_MODULE.tables.move_all_players_timer));
  }

  get player(): PlayerTableHandle {
    return new PlayerTableHandle(this.connection.clientCache.getOrCreateTable<Player>(REMOTE_MODULE.tables.player));
  }

  get spawnFoodTimer(): SpawnFoodTimerTableHandle {
    return new SpawnFoodTimerTableHandle(this.connection.clientCache.getOrCreateTable<SpawnFoodTimer>(REMOTE_MODULE.tables.spawn_food_timer));
  }
}

export class SubscriptionBuilder extends SubscriptionBuilderImpl<RemoteTables, RemoteReducers, SetReducerFlags> { }

export class DbConnection extends DbConnectionImpl<RemoteTables, RemoteReducers, SetReducerFlags> {
  static builder = (): DbConnectionBuilder<DbConnection, ErrorContext, SubscriptionEventContext> => {
    return new DbConnectionBuilder<DbConnection, ErrorContext, SubscriptionEventContext>(REMOTE_MODULE, (imp: DbConnectionImpl) => imp as DbConnection);
  }
  subscriptionBuilder = (): SubscriptionBuilder => {
    return new SubscriptionBuilder(this);
  }
}

export type EventContext = EventContextInterface<RemoteTables, RemoteReducers, SetReducerFlags, Reducer>;
export type ReducerEventContext = ReducerEventContextInterface<RemoteTables, RemoteReducers, SetReducerFlags, Reducer>;
export type SubscriptionEventContext = SubscriptionEventContextInterface<RemoteTables, RemoteReducers, SetReducerFlags>;
export type ErrorContext = ErrorContextInterface<RemoteTables, RemoteReducers, SetReducerFlags>;
