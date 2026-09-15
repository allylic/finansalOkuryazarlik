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
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [latestNews, setLatestNews] = useState(null)
  const [portfolioSnapshots, setPortfolioSnapshots] = useState([])
  const [rebalancePlayers, setRebalancePlayers] = useState([])
  const [portfolio, setPortfolio] = useState(emptyPortfolio)
  const [rebalancePortfolio, setRebalancePortfolio] = useState(emptyPortfolio)
  const [currentTime, setCurrentTime] = useState(Date.now)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const currentPlayer = useMemo(
    () => players.find((player) => player.id === playerId),
    [playerId, players],
  )
  const activePlayer = game ? players[game.current_turn_index] : null
  const portfolioTotal = getPortfolioTotal(portfolio)
  const remainingBudget = INITIAL_BUDGET - portfolioTotal
  const rebalanceTotal = getPortfolioTotal(rebalancePortfolio)
  const rebalanceBudget = Number(currentPlayer?.total_value ?? 0)
  const remainingRebalanceBudget = rebalanceBudget - rebalanceTotal
  const secondsRemaining = game?.rebalance_ends_at
    ? Math.max(0, Math.ceil((new Date(game.rebalance_ends_at).getTime() - currentTime) / 1000))
    : 0
  const formattedTime = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`
  const rankedPlayers = [...players].sort((first, second) => Number(second.total_value) - Number(first.total_value))
  const playerPerformance = rankedPlayers.map((player) => {
    const snapshot = portfolioSnapshots.find((item) => item.player_id === player.id)
    const investments = investmentOptions.map(({ key, label }) => {
      const startingValue = Number(snapshot?.[key] ?? 0)
      const value = Number(player[key])
      const change = value - startingValue
      return { label, change, percentage: startingValue ? (change / startingValue) * 100 : 0, value }
    })
    return {
      ...player,
      bestInvestment: [...investments].sort((first, second) => second.change - first.change)[0],
      worstInvestment: [...investments].sort((first, second) => first.change - second.change)[0],
    }
  })

  const loadGame = useCallback(async (requestedGameId) => {
    if (!supabase || !requestedGameId) return

    const [gameResult, playersResult, newsResult, snapshotsResult, rebalanceResult] = await Promise.all([
      supabase.from('games').select('*').eq('id', requestedGameId).single(),
      supabase.from('players').select('*').eq('game_id', requestedGameId).order('created_at'),
      supabase
        .from('game_news')
        .select('round_number, drawn_at, news:news_id(haber_metni)')
        .eq('game_id', requestedGameId)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('game_portfolio_snapshots').select('*').eq('game_id', requestedGameId),
      supabase.from('player_rebalances').select('player_id').eq('game_id', requestedGameId),
    ])

    if (gameResult.error || playersResult.error || newsResult.error || snapshotsResult.error || rebalanceResult.error) {
      setMessage(gameResult.error?.message ?? playersResult.error?.message ?? newsResult.error?.message ?? snapshotsResult.error?.message ?? rebalanceResult.error?.message ?? 'Oyun bilgileri yüklenemedi.')
      return
    }

    setGame(gameResult.data)
    setPlayers(playersResult.data)
    setLatestNews(newsResult.data)
    setPortfolioSnapshots(snapshotsResult.data)
    setRebalancePlayers(rebalanceResult.data)
    if (gameResult.data.status === 'playing') setScreen('game')
    if (gameResult.data.status === 'rebalancing') setScreen('rebalance')
    if (gameResult.data.status === 'finished') setScreen('results')
  }, [])

  useEffect(() => {
    if (!gameId || !supabase) return undefined

    loadGame(gameId)
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => loadGame(gameId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, () => loadGame(gameId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_news', filter: `game_id=eq.${gameId}` }, () => loadGame(gameId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rebalances', filter: `game_id=eq.${gameId}` }, () => loadGame(gameId))
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

  useEffect(() => {
    if (game?.status !== 'rebalancing') return undefined

    setRebalancePortfolio(Object.fromEntries(investmentOptions.map(({ key }) => [key, String(currentPlayer?.[key] ?? 0)])))
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [currentPlayer, game?.status])

  useEffect(() => {
    if (game?.status !== 'rebalancing' || secondsRemaining > 0) return
    supabase.rpc('finish_rebalance_if_due', { requested_game_id: gameId }).then(({ error }) => {
      if (error) setMessage(error.message)
    })
  }, [game?.status, gameId, secondsRemaining])

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
    if (!currentPlayer) return
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

    const { data: refreshedPlayers, error: playersError } = await supabase.from('players').select('*').eq('game_id', gameId)
    if (!playersError && refreshedPlayers.length > 0 && refreshedPlayers.every(isPortfolioComplete)) {
      const { error: statusError } = await supabase.from('games').update({ status: 'playing' }).eq('id', gameId)
      if (statusError) setMessage(statusError.message)
    }
    setLoading(false)
    setScreen('lobby')
    setMessage('Portföyün onaylandı. Diğer oyuncular bekleniyor.')
  }

  const drawNews = async () => {
    if (!gameId || !playerId) return

    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('draw_news_for_game', {
      requested_game_id: gameId,
      requested_player_id: playerId,
    })
    setLoading(false)

    if (error) return setMessage(error.message)
    setLatestNews({ round_number: data.round_count, news: data.news })
  }

  const submitRebalance = async (keepPortfolio) => {
    if (!gameId || !playerId || !currentPlayer) return
    if (!keepPortfolio && Math.abs(remainingRebalanceBudget) > 0.01) {
      setMessage('Portföy toplamı güncel toplam varlığına eşit olmalı.')
      return
    }

    const nextPortfolio = keepPortfolio
      ? Object.fromEntries(investmentOptions.map(({ key }) => [key, Number(currentPlayer[key]) || 0]))
      : Object.fromEntries(investmentOptions.map(({ key }) => [key, Number(rebalancePortfolio[key]) || 0]))

    setLoading(true)
    setMessage('')
    const { error } = await supabase.rpc('submit_rebalance', {
      requested_game_id: gameId,
      requested_player_id: playerId,
      requested_portfolio: nextPortfolio,
    })
    setLoading(false)

    if (error) return setMessage(error.message)
    setMessage('Hazır durumun kaydedildi. Diğer oyuncular bekleniyor.')
  }

  const leaveGame = () => {
    localStorage.removeItem('finans-game-id')
    localStorage.removeItem('finans-player-id')
    setGameId('')
    setPlayerId('')
    setGame(null)
    setPlayers([])
    setLatestNews(null)
    setPortfolioSnapshots([])
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

  if (screen === 'results') {
    const winner = playerPerformance[0]

    return (
      <main className="app-shell">
        <section className="results-card">
          <span className="eyebrow">Oyun tamamlandı · {game?.round_count ?? 0} tur</span>
          <h1>Muz Cumhuriyeti Finans Bakanı</h1>
          {winner && (
            <div className="winner-card">
              <span>Kazanan</span>
              <h2>{winner.name}</h2>
              <strong>{formatCurrency(winner.total_value)}</strong>
            </div>
          )}
          <div className="leaderboard">
            {playerPerformance.map((player, index) => (
              <article className="score-card" key={player.id}>
                <div className="score-heading">
                  <span>#{index + 1} · {player.name}{player.id === playerId ? ' (Sen)' : ''}</span>
                  <strong>{formatCurrency(player.total_value)}</strong>
                </div>
                <div className="score-details">
                  <span>En güçlü: <b>{player.bestInvestment.label}</b> · %{player.bestInvestment.percentage.toFixed(1)}</span>
                  <span>En zayıf: <b>{player.worstInvestment.label}</b> · %{player.worstInvestment.percentage.toFixed(1)}</span>
                </div>
              </article>
            ))}
          </div>
          <button className="primary-button full-width" type="button" onClick={leaveGame}>Yeni Oyun</button>
        </section>
      </main>
    )
  }

  if (screen === 'rebalance') {
    const isReady = rebalancePlayers.some((player) => player.player_id === playerId)

    return (
      <main className="app-shell">
        <section className="portfolio-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Yeniden dağıtım turu</span>
              <h1>Portföyünü güncelle</h1>
            </div>
            <strong className="timer">{formattedTime}</strong>
          </div>
          <p>Güncel varlığın olan {formatCurrency(rebalanceBudget)} tutarını yeniden dağıtabilir veya mevcut portföyünle devam edebilirsin.</p>
          <div className="budget-panel">
            <span>Kalan tutar</span>
            <strong className={Math.abs(remainingRebalanceBudget) < 0.01 ? 'complete' : remainingRebalanceBudget < 0 ? 'invalid' : ''}>{formatCurrency(remainingRebalanceBudget)}</strong>
          </div>
          <div className="allocation-grid">
            {investmentOptions.map(({ key, label }) => (
              <label className="allocation-field" key={key}>
                <span>{label}</span>
                <input disabled={isReady || loading} inputMode="numeric" min="0" step="0.01" type="number" value={rebalancePortfolio[key]} onChange={(event) => setRebalancePortfolio((current) => ({ ...current, [key]: event.target.value }))} />
              </label>
            ))}
          </div>
          <div className="portfolio-footer">
            <span>Dağıtılan: <strong>{formatCurrency(rebalanceTotal)}</strong></span>
            <div className="rebalance-actions">
              <button className="secondary-button" disabled={loading || isReady} type="button" onClick={() => submitRebalance(true)}>Değişiklik Yapma</button>
              <button className="primary-button" disabled={loading || isReady || Math.abs(remainingRebalanceBudget) > 0.01} type="button" onClick={() => submitRebalance(false)}>{isReady ? 'Hazır durumundasın' : loading ? 'Kaydediliyor...' : 'Hazırım'}</button>
            </div>
          </div>
          <p className="ready-summary">Hazır oyuncular: {rebalancePlayers.length} / {players.length}</p>
          {message && <p className="status-message">{message}</p>}
        </section>
      </main>
    )
  }

  if (screen === 'game') {
    return (
      <main className="app-shell">
        <section className="game-card">
          <div className="game-header">
            <div>
              <span className="eyebrow">Tur {game?.round_count ?? 0}</span>
              <h1>Haber Çarkı</h1>
            </div>
            <span className="turn-badge">Sıra: {activePlayer?.name ?? 'Yükleniyor'}</span>
          </div>

          {latestNews ? (
            <article className="news-card">
              <span>Son dakika · Tur {latestNews.round_number}</span>
              <h2>{latestNews.news.haber_metni}</h2>
              <p>Haber etkileri tüm portföylere uygulandı.</p>
            </article>
          ) : (
            <article className="news-card waiting-news">
              <span>İlk haber bekleniyor</span>
              <h2>Sırası gelen oyuncu haber çarkını başlatsın.</h2>
            </article>
          )}

          <button className="primary-button full-width" disabled={loading || activePlayer?.id !== playerId} type="button" onClick={drawNews}>
            {loading ? 'Haber çekiliyor...' : activePlayer?.id === playerId ? 'Haber Çek' : `${activePlayer?.name ?? 'Diğer oyuncu'} haber çekiyor`}
          </button>
          <div className="player-list portfolio-list">
            {players.map((player) => (
              <div className="player-row" key={player.id}>
                <span>{player.name}{player.id === playerId ? ' (Sen)' : ''}</span>
                <strong>{formatCurrency(player.total_value)}</strong>
              </div>
            ))}
          </div>
          {message && <p className="status-message">{message}</p>}
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
                <input inputMode="numeric" min="0" step="1000" type="number" value={portfolio[key]} onChange={(event) => setPortfolio((current) => ({ ...current, [key]: event.target.value }))} />
              </label>
            ))}
          </div>
          <div className="portfolio-footer">
            <span>Dağıtılan: <strong>{formatCurrency(portfolioTotal)}</strong></span>
            <button className="primary-button" disabled={loading || remainingBudget !== 0} type="button" onClick={confirmPortfolio}>{loading ? 'Kaydediliyor...' : 'Onayla ve Oyuna Geç'}</button>
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
            <label>Oyuncu adı<input maxLength="40" placeholder="Adını yaz" value={name} onChange={(event) => setName(event.target.value)} /></label>
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
            <div className="room-code"><span>Oda kodu</span><code>{gameId}</code></div>
            <div className="player-list">
              {players.map((player) => (
                <div className="player-row" key={player.id}>
                  <span>{player.name}{player.id === playerId ? ' (Sen)' : ''}</span>
                  <strong className={isPortfolioComplete(player) ? 'ready' : 'waiting'}>{isPortfolioComplete(player) ? 'Hazır' : 'Portföy bekleniyor'}</strong>
                </div>
              ))}
            </div>
            <button className="primary-button full-width" type="button" onClick={() => setScreen('portfolio')}>{isPortfolioComplete(currentPlayer ?? {}) ? 'Portföyünü Görüntüle' : 'Portföyünü Oluştur'}</button>
            <button className="text-button" type="button" onClick={leaveGame}>Odadan ayrıl</button>
          </div>
        )}
        {message && <p className="status-message">{message}</p>}
      </section>
    </main>
  )
}

export default App
