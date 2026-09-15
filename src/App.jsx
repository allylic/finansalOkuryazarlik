import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './App.css'

const INITIAL_BUDGET = 1_000_000

const investmentOptions = [
  { key: 'hisse', label: 'Hisse' },
  { key: 'fon', label: 'Fon' },
  { key: 'eurobond', label: 'Eurobond' },
  { key: 'altin', label: 'Altın' },
  { key: 'gumus', label: 'Gümüş' },
  { key: 'faiz', label: 'Faiz' },
  { key: 'viop', label: 'VİOP' },
  { key: 'tahvil', label: 'Tahvil' },
]

const emptyPortfolio = () => Object.fromEntries(investmentOptions.map(({ key }) => [key, '0']))

const formatCurrency = (value) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value)

const getPortfolioTotal = (portfolio) =>
  investmentOptions.reduce((total, { key }) => total + (Number(portfolio[key]) || 0), 0)

const isPortfolioComplete = (player) =>
  Math.round(getPortfolioTotal(player)) === Math.round(Number(player.total_value))

function App() {
  const [screen, setScreen] = useState('lobby')
  const [name, setName] = useState(() => localStorage.getItem('finans-game-name') ?? '')
  const [gameId, setGameId] = useState(() => localStorage.getItem('finans-game-id') ?? '')
  const [playerId, setPlayerId] = useState(() => localStorage.getItem('finans-player-id') ?? '')
  const [joinGameId, setJoinGameId] = useState('')
  const [players, setPlayers] = useState([])
  const [portfolio, setPortfolio] = useState(emptyPortfolio)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const currentPlayer = useMemo(
    () => players.find((player) => player.id === playerId),
    [playerId, players],
  )
  const portfolioTotal = getPortfolioTotal(portfolio)
  const remainingBudget = INITIAL_BUDGET - portfolioTotal

  const loadGame = useCallback(async (requestedGameId) => {
    if (!supabase || !requestedGameId) return

    const [{ data: gameData, error: gameError }, { data: playersData, error: playersError }] = await Promise.all([
      supabase.from('games').select('*').eq('id', requestedGameId).single(),
      supabase.from('players').select('*').eq('game_id', requestedGameId).order('created_at'),
    ])

    if (gameError || playersError) {
      setMessage(gameError?.message ?? playersError?.message ?? 'Oyun bilgileri yüklenemedi.')
      return
    }

    setPlayers(playersData)
    if (gameData.status === 'playing') setScreen('game')
  }, [])

  useEffect(() => {
    if (!gameId || !supabase) return undefined

    loadGame(gameId)
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => loadGame(gameId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, () => loadGame(gameId))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, loadGame])

  useEffect(() => {
    if (currentPlayer && !isPortfolioComplete(currentPlayer)) {
      setPortfolio(Object.fromEntries(investmentOptions.map(({ key }) => [key, String(currentPlayer[key] ?? 0)])))
    }
  }, [currentPlayer])

  const saveSession = (nextGameId, nextPlayerId, nextName) => {
    localStorage.setItem('finans-game-id', nextGameId)
    localStorage.setItem('finans-player-id', nextPlayerId)
    localStorage.setItem('finans-game-name', nextName)
    setGameId(nextGameId)
    setPlayerId(nextPlayerId)
    setName(nextName)
  }

  const createGame = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return setMessage('Devam etmek için oyuncu adını girin.')
    if (!supabase) return setMessage('Supabase bağlantısı yapılandırılmamış.')

    setLoading(true)
    setMessage('')
    const { data: createdGame, error: gameError } = await supabase.from('games').insert({}).select().single()
    if (gameError) {
      setLoading(false)
      return setMessage(gameError.message)
    }

    const { data: createdPlayer, error: playerError } = await supabase
      .from('players')
      .insert({ game_id: createdGame.id, name: trimmedName })
      .select()
      .single()
    setLoading(false)

    if (playerError) return setMessage(playerError.message)
    saveSession(createdGame.id, createdPlayer.id, trimmedName)
    setMessage('Oyun odası oluşturuldu. Oda kodunu arkadaşlarınla paylaş.')
  }

  const joinGame = async () => {
    const trimmedName = name.trim()
    const requestedGameId = joinGameId.trim()
    if (!trimmedName || !requestedGameId) return setMessage('Oyuncu adını ve oda kodunu girin.')
    if (!supabase) return setMessage('Supabase bağlantısı yapılandırılmamış.')

    setLoading(true)
    setMessage('')
    const { data: targetGame, error: gameError } = await supabase.from('games').select('*').eq('id', requestedGameId).single()
    if (gameError || targetGame.status !== 'waiting') {
      setLoading(false)
      return setMessage(gameError?.message ?? 'Bu oyun odasına artık katılım yapılamaz.')
    }

    const { data: joinedPlayer, error: playerError } = await supabase
      .from('players')
      .insert({ game_id: requestedGameId, name: trimmedName })
      .select()
      .single()
    setLoading(false)

    if (playerError) return setMessage(playerError.message)
    saveSession(requestedGameId, joinedPlayer.id, trimmedName)
    setMessage('Oyun odasına katıldın.')
  }

  const confirmPortfolio = async () => {
    if (!currentPlayer || !supabase) return
    if (Math.round(portfolioTotal) !== INITIAL_BUDGET) {
      setMessage('Portföy toplamı tam olarak 1.000.000 TL olmalı.')
      return
    }

    setLoading(true)
    setMessage('')
    const values = Object.fromEntries(investmentOptions.map(({ key }) => [key, Number(portfolio[key]) || 0]))
    const { error } = await supabase.from('players').update(values).eq('id', currentPlayer.id)
    if (error) {
      setLoading(false)
      return setMessage(error.message)
    }

    await loadGame(gameId)
    const { data: refreshedPlayers, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
    if (!playersError && refreshedPlayers.length > 0 && refreshedPlayers.every(isPortfolioComplete)) {
      const { error: statusError } = await supabase.from('games').update({ status: 'playing' }).eq('id', gameId)
      if (statusError) setMessage(statusError.message)
    }
    setLoading(false)
    setScreen('lobby')
    setMessage('Portföyün onaylandı. Diğer oyuncular bekleniyor.')
  }

  const leaveGame = () => {
    localStorage.removeItem('finans-game-id')
    localStorage.removeItem('finans-player-id')
    setGameId('')
    setPlayerId('')
    setPlayers([])
    setPortfolio(emptyPortfolio())
    setScreen('lobby')
    setMessage('')
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="app-shell">
        <section className="setup-card">
          <span className="eyebrow">Muz Cumhuriyeti</span>
          <h1>Finans Oyunu</h1>
          <p>Oyunu başlatmak için Supabase ortam değişkenleri yapılandırılmalıdır.</p>
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_ANON_KEY</code>
        </section>
      </main>
    )
  }

  if (screen === 'game') {
    return (
      <main className="app-shell">
        <section className="game-card">
          <span className="eyebrow">Oyun başladı</span>
          <h1>Portföyler hazır</h1>
          <p>Tüm oyuncular başlangıç portföylerini onayladı. Haber çarkı Faz 3'te eklenecek.</p>
          <div className="player-list">
            {players.map((player) => (
              <div className="player-row" key={player.id}>
                <span>{player.name}</span>
                <strong>{formatCurrency(player.total_value)}</strong>
              </div>
            ))}
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'portfolio') {
    return (
      <main className="app-shell">
        <section className="portfolio-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Başlangıç portföyü</span>
              <h1>1.000.000 TL'yi dağıt</h1>
            </div>
            <button className="text-button" type="button" onClick={() => setScreen('lobby')}>Lobiye dön</button>
          </div>
          <div className="budget-panel">
            <span>Kalan bütçe</span>
            <strong className={remainingBudget === 0 ? 'complete' : remainingBudget < 0 ? 'invalid' : ''}>{formatCurrency(remainingBudget)}</strong>
          </div>
          <div className="allocation-grid">
            {investmentOptions.map(({ key, label }) => (
              <label className="allocation-field" key={key}>
                <span>{label}</span>
                <input
                  inputMode="numeric"
                  min="0"
                  step="1000"
                  type="number"
                  value={portfolio[key]}
                  onChange={(event) => setPortfolio((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="portfolio-footer">
            <span>Dağıtılan: <strong>{formatCurrency(portfolioTotal)}</strong></span>
            <button className="primary-button" disabled={loading || remainingBudget !== 0} type="button" onClick={confirmPortfolio}>
              {loading ? 'Kaydediliyor...' : 'Onayla ve Oyuna Geç'}
            </button>
          </div>
          {message && <p className="status-message">{message}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="lobby-card">
        <span className="eyebrow">Muz Cumhuriyeti</span>
        <h1>Finans Oyunu</h1>
        <p className="intro">Haberleri doğru okuyup en güçlü portföyü oluştur.</p>

        {!gameId ? (
          <div className="join-grid">
            <label>
              Oyuncu adı
              <input maxLength="40" placeholder="Adını yaz" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="action-card">
              <h2>Yeni oyun</h2>
              <p>Bir oda oluştur ve kodu diğer oyuncularla paylaş.</p>
              <button className="primary-button" disabled={loading} type="button" onClick={createGame}>{loading ? 'Oluşturuluyor...' : 'Oda Oluştur'}</button>
            </div>
            <div className="action-card">
              <h2>Oyuna katıl</h2>
              <input placeholder="Oda kodu" value={joinGameId} onChange={(event) => setJoinGameId(event.target.value)} />
              <button className="secondary-button" disabled={loading} type="button" onClick={joinGame}>{loading ? 'Katılınıyor...' : 'Odaya Katıl'}</button>
            </div>
          </div>
        ) : (
          <div className="room-view">
            <div className="room-code">
              <span>Oda kodu</span>
              <code>{gameId}</code>
            </div>
            <div className="player-list">
              {players.map((player) => (
                <div className="player-row" key={player.id}>
                  <span>{player.name}{player.id === playerId ? ' (Sen)' : ''}</span>
                  <strong className={isPortfolioComplete(player) ? 'ready' : 'waiting'}>{isPortfolioComplete(player) ? 'Hazır' : 'Portföy bekleniyor'}</strong>
                </div>
              ))}
            </div>
            <button className="primary-button full-width" type="button" onClick={() => setScreen('portfolio')}>
              {isPortfolioComplete(currentPlayer ?? {}) ? 'Portföyünü Görüntüle' : 'Portföyünü Oluştur'}
            </button>
            <button className="text-button" type="button" onClick={leaveGame}>Odadan ayrıl</button>
          </div>
        )}
        {message && <p className="status-message">{message}</p>}
      </section>
    </main>
  )
}

export default App
