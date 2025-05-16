import { useEffect, useState, useRef } from 'react'
import { DbConnection, Identity } from '@clockworklabs/spacetimedb-sdk'
import { DbVector2, EventContext, ErrorContext } from '../../../spacetime-agario/client/src/module_bindings'
import { Entity } from '../../../spacetime-agario/client/src/module_bindings'
import { Circle } from '../../../spacetime-agario/client/src/module_bindings'
import { Food } from '../../../spacetime-agario/client/src/module_bindings'
import { Player } from '../../../spacetime-agario/client/src/module_bindings'
import { Config } from '../../../spacetime-agario/client/src/module_bindings'
import './App.css'

function useGameState(conn: DbConnection | null) {
  const [entities, setEntities] = useState<Map<number, Entity>>(new Map())
  const [circles, setCircles] = useState<Map<number, Circle>>(new Map())
  const [foods, setFoods] = useState<Map<number, Food>>(new Map())
  const [players, setPlayers] = useState<Map<string, Player>>(new Map())
  const [config, setConfig] = useState<Config | null>(null)
  const [playerName, setPlayerName] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!conn) return

    // Subscribe to entities
    const onEntityInsert = (_ctx: EventContext, entity: Entity) => {
      setEntities(prev => new Map(prev.set(entity.entityId, entity)))
    }
    const onEntityDelete = (_ctx: EventContext, entity: Entity) => {
      setEntities(prev => {
        const next = new Map(prev)
        next.delete(entity.entityId)
        return next
      })
    }
    const onEntityUpdate = (_ctx: EventContext, _old: Entity, entity: Entity) => {
      setEntities(prev => new Map(prev.set(entity.entityId, entity)))
    }

    // Subscribe to circles
    const onCircleInsert = (_ctx: EventContext, circle: Circle) => {
      setCircles(prev => new Map(prev.set(circle.entityId, circle)))
    }
    const onCircleDelete = (_ctx: EventContext, circle: Circle) => {
      setCircles(prev => {
        const next = new Map(prev)
        next.delete(circle.entityId)
        return next
      })
    }
    const onCircleUpdate = (_ctx: EventContext, _old: Circle, circle: Circle) => {
      setCircles(prev => new Map(prev.set(circle.entityId, circle)))
    }

    // Subscribe to food
    const onFoodInsert = (_ctx: EventContext, food: Food) => {
      setFoods(prev => new Map(prev.set(food.entityId, food)))
    }
    const onFoodDelete = (_ctx: EventContext, food: Food) => {
      setFoods(prev => {
        const next = new Map(prev)
        next.delete(food.entityId)
        return next
      })
    }

    // Subscribe to players
    const onPlayerInsert = (_ctx: EventContext, player: Player) => {
      setPlayers(prev => new Map(prev.set(player.identity.toHexString(), player)))
    }
    const onPlayerDelete = (_ctx: EventContext, player: Player) => {
      setPlayers(prev => {
        const next = new Map(prev)
        next.delete(player.identity.toHexString())
        return next
      })
    }

    // Subscribe to config
    const onConfigInsert = (_ctx: EventContext, cfg: Config) => {
      setConfig(cfg)
    }

    // Set up subscriptions
    conn.subscriptionBuilder()
      .subscribe('entity')
      .subscribe('circle')
      .subscribe('food')
      .subscribe('player')
      .subscribe('config')
      .start()

    // Register event handlers
    conn.entity.onInsert(onEntityInsert)
    conn.entity.onDelete(onEntityDelete)
    conn.entity.onUpdate(onEntityUpdate)

    conn.circle.onInsert(onCircleInsert)
    conn.circle.onDelete(onCircleDelete)
    conn.circle.onUpdate(onCircleUpdate)

    conn.food.onInsert(onFoodInsert)
    conn.food.onDelete(onFoodDelete)

    conn.player.onInsert(onPlayerInsert)
    conn.player.onDelete(onPlayerDelete)

    conn.config.onInsert(onConfigInsert)

    return () => {
      conn.entity.removeOnInsert(onEntityInsert)
      conn.entity.removeOnDelete(onEntityDelete)
      conn.entity.removeOnUpdate(onEntityUpdate)

      conn.circle.removeOnInsert(onCircleInsert)
      conn.circle.removeOnDelete(onCircleDelete)
      conn.circle.removeOnUpdate(onCircleUpdate)

      conn.food.removeOnInsert(onFoodInsert)
      conn.food.removeOnDelete(onFoodDelete)

      conn.player.removeOnInsert(onPlayerInsert)
      conn.player.removeOnDelete(onPlayerDelete)

      conn.config.removeOnInsert(onConfigInsert)
    }
  }, [conn])

  return {
    entities,
    circles,
    foods,
    players,
    config,
    playerName,
    setPlayerName,
    isPlaying,
    setIsPlaying
  }
}

function App() {
  const [conn, setConn] = useState<DbConnection | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [connected, setConnected] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const {
    entities,
    circles,
    foods,
    players,
    config,
    playerName,
    setPlayerName,
    isPlaying,
    setIsPlaying
  } = useGameState(conn)

  useEffect(() => {
    // Connect to SpaceTimeDB
    const connection = DbConnection.builder()
      .withAuthToken('default')
      .withModule('spacetime-agario')
      .withAddress('localhost:3000')
      .build()

    connection.connect()
    setConn(connection)

    return () => {
      connection.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!conn) return

    const onConnect = (
      _conn: DbConnection,
      ident: Identity,
      _token: string
    ) => {
      setIdentity(ident)
      setConnected(true)
      conn.connect()
    }

    const onDisconnect = () => {
      setConnected(false)
    }

    const onConnectError = (_ctx: ErrorContext, err: Error) => {
      console.error('Connection error:', err)
    }

    conn.onConnect(onConnect)
    conn.onDisconnect(onDisconnect)
    conn.onConnectError(onConnectError)

    return () => {
      conn.removeOnConnect(onConnect)
      conn.removeOnDisconnect(onDisconnect)
      conn.removeOnConnectError(onConnectError)
    }
  }, [conn])

  useEffect(() => {
    if (!canvasRef.current || !config) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw food
      ctx.fillStyle = '#F44336'
      foods.forEach(food => {
        const entity = entities.get(food.entityId)
        if (entity) {
          ctx.beginPath()
          ctx.arc(entity.position.x, entity.position.y, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      // Draw circles
      circles.forEach(circle => {
        const entity = entities.get(circle.entityId)
        if (entity) {
          ctx.fillStyle = circle.playerId % 2 === 0 ? '#2196F3' : '#4CAF50'
          ctx.beginPath()
          ctx.arc(
            entity.position.x,
            entity.position.y,
            Math.sqrt(entity.mass),
            0,
            Math.PI * 2
          )
          ctx.fill()
        }
      })

      requestAnimationFrame(draw)
    }

    draw()
  }, [canvasRef, entities, circles, foods, config])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!conn || !isPlaying) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const direction: DbVector2 = {
      x: x / canvas.width,
      y: y / canvas.height
    }

    conn.updatePlayerInput(direction)
  }

  const handleStartGame = (e: React.FormEvent) => {
    e.preventDefault()
    if (!conn || !playerName) return

    conn.enterGame(playerName)
    setIsPlaying(true)
  }

  const handleSplit = () => {
    if (!conn || !isPlaying) return
    conn.playerSplit()
  }

  const handleRespawn = () => {
    if (!conn || !isPlaying) return
    conn.respawn()
  }

  return (
    <div className="game-container">
      {!isPlaying ? (
        <form onSubmit={handleStartGame}>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Enter your name"
          />
          <button type="submit">Play</button>
        </form>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onMouseMove={handleMouseMove}
          />
          <div className="controls">
            <button onClick={handleSplit}>Split</button>
            <button onClick={handleRespawn}>Respawn</button>
          </div>
        </>
      )}
    </div>
  )
}

export default App
