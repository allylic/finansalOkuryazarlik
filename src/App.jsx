import { useCallback, useEffect, useMemo, useState } from 'react'
import * as gameStore from './lib/gameStore'
import './App.css'

const INITIAL_BUDGET = 1_000_000

const investmentOptions = [
  { key: 'hisse', label: 'Hisse Senedi', icon: '📈', color: '#2563eb' },
  { key: 'fon', label: 'Yatırım Fonu', icon: '📊', color: '#7c3aed' },
  { key: 'eurobond', label: 'Eurobond', icon: '🇪🇺', color: '#0284c7' },
  { key: 'altin', label: 'Altın', icon: '🪙', color: '#d97706' },
  { key: 'gumus', label: 'Gümüş', icon: '⚪', color: '#64748b' },
  { key: 'faiz', label: 'Mevduat / Faiz', icon: '🏦', color: '#059669' },
  { key: 'viop', label: 'VİOP', icon: '⚡', color: '#dc2626' },
  { key: 'tahvil', label: 'Devlet Tahvili', icon: '📜', color: '#4f46e5' },
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
  Math.round(getPortfolioTotal(player)) === Math.round(Number(player?.total_value ?? 0))

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
  const [spinningWheel, setSpinningWheel] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    gameStore.loadNews()
  }, [])

  const currentPlayer = useMemo(
    () => players.find((player) => player.id === playerId),
    [playerId, players],
  )
  const activePlayer = game ? players[game.current_turn_index % (players.length || 1)] : null
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
    const initialTotal = INITIAL_BUDGET
    const totalChange = player.total_value - initialTotal
    const totalRoiPct = (totalChange / initialTotal) * 100

    const investments = investmentOptions.map(({ key, label, icon, color }) => {
      const startingValue = Number(snapshot?.[key] ?? 0)
      const finalValue = Number(player[key]) || 0
      const change = finalValue - startingValue
      const percentage = startingValue > 0 ? (change / startingValue) * 100 : 0
      const sharePct = player.total_value > 0 ? (finalValue / player.total_value) * 100 : 0
      return { key, label, icon, color, startingValue, finalValue, change, percentage, sharePct }
    })

    const sortedByChange = [...investments].sort((a, b) => b.change - a.change)
    const bestInvestment = sortedByChange[0]
    const worstInvestment = sortedByChange[sortedByChange.length - 1]

    return {
      ...player,
      totalChange,
      totalRoiPct,
      investments,
      bestInvestment,
      worstInvestment,
    }
  })

  const handleGameData = useCallback((data) => {
    if (!data.game) return
    setGame(data.game)
    setPlayers(data.players)
    setLatestNews(data.latestNews)
    setPortfolioSnapshots(data.snapshots)
    setRebalancePlayers(data.rebalances)

    if (data.game.status === 'waiting') setScreen('lobby')
    if (data.game.status === 'playing') setScreen('game')
    if (data.game.status === 'rebalancing') setScreen('rebalance')
    if (data.game.status === 'finished') setScreen('results')
  }, [])

  const loadGame = useCallback(
    async (requestedGameId) => {
      if (!requestedGameId) return
      try {
        const data = await gameStore.loadGameData(requestedGameId)
        if (data.game) {
          handleGameData(data)
        }
      } catch (err) {
        setMessage('Oyun bilgileri yüklenemedi: ' + err.message)
      }
    },
    [handleGameData],
  )

  useEffect(() => {
    if (!gameId) return undefined

    loadGame(gameId)
    const unsubscribe = gameStore.subscribeToGame(gameId, (data) => {
      handleGameData(data)
    })

    return () => {
      unsubscribe()
    }
  }, [gameId, loadGame, handleGameData])

  useEffect(() => {
    if (currentPlayer && !isPortfolioComplete(currentPlayer) && screen === 'portfolio') {
      setPortfolio(Object.fromEntries(investmentOptions.map(({ key }) => [key, String(currentPlayer[key] ?? 0)])))
    }
  }, [currentPlayer, screen])

  useEffect(() => {
    if (game?.status !== 'rebalancing') return undefined

    setRebalancePortfolio(Object.fromEntries(investmentOptions.map(({ key }) => [key, String(currentPlayer?.[key] ?? 0)])))
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [currentPlayer, game?.status])

  useEffect(() => {
    if (game?.status !== 'rebalancing' || secondsRemaining > 0) return
    gameStore.finishRebalanceIfDue(gameId).then(() => {
      loadGame(gameId)
    })
  }, [game?.status, gameId, secondsRemaining, loadGame])

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
    try {
      const { game: createdGame, player: createdPlayer } = await gameStore.createGame(trimmedName)
      saveSession(createdGame.id, createdPlayer.id, trimmedName)
      await loadGame(createdGame.id)
      setMessage('Oyun odası oluşturuldu. Oda kodunu arkadaşlarınla paylaş.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  const joinGame = async () => {
    const trimmedName = name.trim()
    const requestedGameId = joinGameId.trim().toUpperCase()
    if (!trimmedName || !requestedGameId) return setMessage('Oyuncu adını ve oda kodunu girin.')

    setLoading(true)
    setMessage('')
    try {
      const { game: targetGame, player: joinedPlayer } = await gameStore.joinGame(requestedGameId, trimmedName)
      saveSession(targetGame.id, joinedPlayer.id, trimmedName)
      await loadGame(targetGame.id)
      setMessage('Oyun odasına katıldın.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  const copyRoomCode = () => {
    if (!gameId) return
    navigator.clipboard.writeText(gameId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const distributeEqually = () => {
    const share = Math.floor(INITIAL_BUDGET / 8)
    const remainder = INITIAL_BUDGET - share * 8
    const newPort = Object.fromEntries(investmentOptions.map(({ key }) => [key, String(share)]))
    newPort['hisse'] = String(share + remainder)
    setPortfolio(newPort)
  }

  const resetPortfolio = () => {
    setPortfolio(emptyPortfolio())
  }

  const adjustPortfolioAsset = (key, delta) => {
    const currentVal = Number(portfolio[key]) || 0
    const maxAllowed = currentVal + Math.max(0, remainingBudget)
    const newVal = Math.min(maxAllowed, Math.max(0, currentVal + delta))
    setPortfolio((current) => ({ ...current, [key]: String(newVal) }))
  }

  const handlePortfolioInput = (key, rawValue) => {
    const currentVal = Number(portfolio[key]) || 0
    const maxAllowed = currentVal + Math.max(0, remainingBudget)
    const val = Math.min(maxAllowed, Math.max(0, Number(rawValue) || 0))
    setPortfolio((current) => ({ ...current, [key]: String(val) }))
  }

  const adjustRebalanceAsset = (key, delta) => {
    const currentVal = Number(rebalancePortfolio[key]) || 0
    const maxAllowed = currentVal + Math.max(0, remainingRebalanceBudget)
    const newVal = Math.min(maxAllowed, Math.max(0, currentVal + delta))
    setRebalancePortfolio((current) => ({ ...current, [key]: String(newVal) }))
  }

  const handleRebalanceInput = (key, rawValue) => {
    const currentVal = Number(rebalancePortfolio[key]) || 0
    const maxAllowed = currentVal + Math.max(0, remainingRebalanceBudget)
    const val = Math.min(maxAllowed, Math.max(0, Number(rawValue) || 0))
    setRebalancePortfolio((current) => ({ ...current, [key]: String(val) }))
  }

  const distributeEquallyRebalance = () => {
    const share = Math.floor(rebalanceBudget / 8)
    const remainder = rebalanceBudget - share * 8
    const newPort = Object.fromEntries(investmentOptions.map(({ key }) => [key, String(share)]))
    newPort['hisse'] = String(share + remainder)
    setRebalancePortfolio(newPort)
  }

  const resetRebalancePortfolio = () => {
    setRebalancePortfolio(emptyPortfolio())
  }

  const keepCurrentPortfolioPresets = () => {
    if (!currentPlayer) return
    setRebalancePortfolio(Object.fromEntries(investmentOptions.map(({ key }) => [key, String(currentPlayer[key] ?? 0)])))
  }

  const confirmPortfolio = async () => {
    if (!currentPlayer) return
    if (Math.round(portfolioTotal) !== INITIAL_BUDGET) {
      setMessage('Portföy toplamı tam olarak 1.000.000 TL olmalı.')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      await gameStore.confirmPortfolio(gameId, currentPlayer.id, portfolio)
      const data = await gameStore.loadGameData(gameId)
      if (data.game?.status === 'playing') {
        setScreen('game')
        setMessage('Portföyün onaylandı! Oyun başladı.')
      } else {
        setScreen('lobby')
        setMessage('Portföyün onaylandı. Dilersen Oyuna Başla butonuna basarak oyunu başlatabilirsin.')
      }
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  const startGameNow = async () => {
    if (!gameId) return
    setLoading(true)
    setMessage('')
    try {
      await gameStore.startGame(gameId)
      await loadGame(gameId)
      setScreen('game')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }


  const drawNews = async () => {
    if (!gameId || !playerId) return

    setLoading(true)
    setSpinningWheel(true)
    setMessage('')
    try {
      // Simulate wheel spin delay for 1.2s for visual WOW factor
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await gameStore.drawNews(gameId, playerId)
      await loadGame(gameId)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
      setSpinningWheel(false)
    }
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
    try {
      await gameStore.submitRebalance(gameId, playerId, nextPortfolio)
      await loadGame(gameId)
      setMessage('Hazır durumun kaydedildi. Diğer oyuncular bekleniyor.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  const restartGame = async () => {
    if (!gameId) return
    setLoading(true)
    setMessage('')
    try {
      await gameStore.restartGame(gameId)
      await loadGame(gameId)
      setMessage('Oyun sıfırlandı. Portföyünüzü yeniden oluşturabilirsiniz.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
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

  // Calculate asset percentage impact badges for the latest news
  const newsImpacts = useMemo(() => {
    if (!latestNews?.news) return []
    return investmentOptions.map(({ key, label, icon }) => {
      const rawEtki = latestNews.news[`${key}_etki`] ?? latestNews.news[key]
      const multiplier = Number(rawEtki) || 1
      const pctChange = Math.round((multiplier - 1) * 100)
      return { key, label, icon, multiplier, pctChange }
    })
  }, [latestNews])

  if (screen === 'results') {
    const winner = playerPerformance[0]

    return (
      <main className="app-shell">
        <section className="results-card">
          <div className="results-header">
            <span className="eyebrow">🏆 MUZ CUMHURİYETİ FİNANS OYUNU · 12 TUR TAMAMLANTI</span>
            <h1>Skor ve İnceleme Tablosu</h1>
            <p>12 turluk çalkantılı finans piyasasının ardından kazanan Finans Bakanı belli oldu!</p>
          </div>

          {winner && (
            <div className="winner-card">
              <div className="winner-badge-row">
                <span className="winner-crown">👑 Kazanan</span>
                <span className="winner-title-tag">Muz Cumhuriyeti Finans Bakanı</span>
              </div>
              <h2>{winner.name}</h2>
              <div className="winner-stats-row">
                <div className="winner-stat">
                  <span>Son Varlık</span>
                  <strong>{formatCurrency(winner.total_value)}</strong>
                </div>
                <div className="winner-stat">
                  <span>Toplam Getiri</span>
                  <strong className={winner.totalChange >= 0 ? 'profit' : 'loss'}>
                    {winner.totalChange >= 0 ? `+${formatCurrency(winner.totalChange)}` : formatCurrency(winner.totalChange)} ({winner.totalRoiPct >= 0 ? `+%${winner.totalRoiPct.toFixed(1)}` : `%${winner.totalRoiPct.toFixed(1)}`})
                  </strong>
                </div>
              </div>
            </div>
          )}

          <div className="leaderboard-section">
            <span className="list-title">📊 Oyuncu Sıralaması & Yatırım Performansları</span>
            <div className="leaderboard">
              {playerPerformance.map((player, index) => {
                const isWinner = index === 0
                const rankBadge = index === 0 ? '🥇 #1' : index === 1 ? '🥈 #2' : index === 2 ? '🥉 #3' : `#${index + 1}`

                return (
                  <article className={`score-card ${isWinner ? 'is-winner' : ''}`} key={player.id}>
                    <div className="score-heading">
                      <div className="player-rank-info">
                        <span className="rank-badge">{rankBadge}</span>
                        <strong className="player-name-text">
                          {player.name} {player.id === playerId ? '(Sen)' : ''}
                        </strong>
                      </div>
                      <div className="player-total-badge">
                        <strong>{formatCurrency(player.total_value)}</strong>
                        <span className={`roi-pill ${player.totalRoiPct >= 0 ? 'positive' : 'negative'}`}>
                          {player.totalRoiPct >= 0 ? `+%${player.totalRoiPct.toFixed(1)}` : `%${player.totalRoiPct.toFixed(1)}`}
                        </span>
                      </div>
                    </div>

                    {/* Best & Worst Performers Grid */}
                    <div className="performance-highlights">
                      <div className="highlight-box best">
                        <span className="highlight-title">🚀 En Çok Kazandıran Yatırım</span>
                        <div className="highlight-body">
                          <span>{player.bestInvestment?.icon} {player.bestInvestment?.label}</span>
                          <strong>
                            {player.bestInvestment?.change >= 0 ? `+${formatCurrency(player.bestInvestment?.change)}` : formatCurrency(player.bestInvestment?.change)}
                            {' '}
                            (%{(player.bestInvestment?.percentage ?? 0).toFixed(1)})
                          </strong>
                        </div>
                      </div>

                      <div className="highlight-box worst">
                        <span className="highlight-title">📉 En Çok Kaybettiren Yatırım</span>
                        <div className="highlight-body">
                          <span>{player.worstInvestment?.icon} {player.worstInvestment?.label}</span>
                          <strong>
                            {player.worstInvestment?.change >= 0 ? `+${formatCurrency(player.worstInvestment?.change)}` : formatCurrency(player.worstInvestment?.change)}
                            {' '}
                            (%{(player.worstInvestment?.percentage ?? 0).toFixed(1)})
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Final Portfolio Breakdown Mini Chips */}
                    <div className="final-asset-breakdown">
                      <span className="breakdown-title">Son Portföy Dağılımı:</span>
                      <div className="breakdown-chips-grid">
                        {player.investments.map(({ key, label, icon, finalValue, sharePct }) => (
                          <div className="asset-chip-card" key={key}>
                            <div className="chip-header">
                              <span>{icon} {label}</span>
                              <span className="chip-share">%{sharePct.toFixed(1)}</span>
                            </div>
                            <strong>{formatCurrency(finalValue)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <div className="results-actions">
            <button className="primary-button full-width restart-btn" disabled={loading} type="button" onClick={restartGame}>
              🔄 Yeniden Başla (Yeni Oyun)
            </button>
            <button className="secondary-button full-width" type="button" onClick={leaveGame}>
              🚪 Odadan Ayrıl & Ana Menüye Dön
            </button>
          </div>
          {message && <p className="status-message">{message}</p>}
        </section>
      </main>
    )
  }


  if (screen === 'rebalance') {
    const isReady = rebalancePlayers.some((player) => player.player_id === playerId)
    const rebalanceAllocatedPct = rebalanceBudget ? Math.min(100, Math.max(0, (rebalanceTotal / rebalanceBudget) * 100)) : 0

    return (
      <main className="app-shell">
        <section className="portfolio-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Yeniden Dağıtım Turu</span>
              <h1>Portföyünü Güncelle</h1>
            </div>
            <strong className="timer">⏱️ {formattedTime}</strong>
          </div>
          <p>Güncel varlığın olan {formatCurrency(rebalanceBudget)} tutarını yeniden dağıtabilir veya mevcut portföyünle devam edebilirsin.</p>

          <div className="progress-container">
            <div className="progress-header">
              <span>Portföy Tamamlanma</span>
              <strong>%{rebalanceAllocatedPct.toFixed(0)}</strong>
            </div>
            <div className="progress-bar-track">
              <div
                className={`progress-bar-fill ${rebalanceAllocatedPct === 100 ? 'complete' : rebalanceAllocatedPct > 100 ? 'invalid' : ''}`}
                style={{ width: `${rebalanceAllocatedPct}%` }}
              />
            </div>
          </div>

          <div className="budget-panel">
            <div>
              <span>Kalan Tutar</span>
              <strong className={Math.abs(remainingRebalanceBudget) < 0.01 ? 'complete' : remainingRebalanceBudget < 0 ? 'invalid' : ''}>
                {formatCurrency(remainingRebalanceBudget)}
              </strong>
            </div>
            <div className="preset-buttons">
              <button className="small-button" disabled={isReady} type="button" onClick={distributeEquallyRebalance}>⚖️ Eşit Dağıt</button>
              <button className="small-button outline" disabled={isReady} type="button" onClick={keepCurrentPortfolioPresets}>📋 Portföyü Koru</button>
              <button className="small-button outline" disabled={isReady} type="button" onClick={resetRebalancePortfolio}>🔄 Sıfırla</button>
            </div>
          </div>
          <div className="kpi-grid">
            {investmentOptions.map(({ key, label, icon, color }) => {
              const currentVal = Number(rebalancePortfolio[key]) || 0
              const maxAllowed = currentVal + Math.max(0, remainingRebalanceBudget)
              const sharePct = rebalanceBudget ? ((currentVal / rebalanceBudget) * 100).toFixed(1) : 0

              return (
                <div className="kpi-card" key={key} style={{ borderTopColor: color }}>
                  <div className="kpi-card-header">
                    <span>{icon} {label}</span>
                    <span className="kpi-share-badge">%{sharePct}</span>
                  </div>

                  <div className="kpi-value-row">
                    <strong className="kpi-amount">{formatCurrency(currentVal)}</strong>
                    <input
                      className="kpi-direct-input"
                      disabled={isReady || loading}
                      inputMode="numeric"
                      min="0"
                      max={maxAllowed}
                      type="number"
                      value={rebalancePortfolio[key]}
                      onChange={(event) => handleRebalanceInput(key, event.target.value)}
                    />
                  </div>

                  <div className="stepper-bar">
                    <button
                      className="stepper-btn dec"
                      disabled={isReady || loading || currentVal <= 0}
                      type="button"
                      onClick={() => adjustRebalanceAsset(key, -50000)}
                    >
                      -50K
                    </button>
                    <button
                      className="stepper-btn dec"
                      disabled={isReady || loading || currentVal <= 0}
                      type="button"
                      onClick={() => adjustRebalanceAsset(key, -20000)}
                    >
                      -20K
                    </button>
                    <button
                      className="stepper-btn inc"
                      disabled={isReady || loading || remainingRebalanceBudget <= 0}
                      type="button"
                      onClick={() => adjustRebalanceAsset(key, 20000)}
                    >
                      +20K
                    </button>
                    <button
                      className="stepper-btn inc"
                      disabled={isReady || loading || remainingRebalanceBudget <= 0}
                      type="button"
                      onClick={() => adjustRebalanceAsset(key, 50000)}
                    >
                      +50K
                    </button>
                  </div>
                </div>
              )
            })}
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
              <span className="eyebrow">Muz Cumhuriyeti · Tur {game?.round_count ?? 0} / 12</span>
              <h1>Haber Çarkı</h1>
            </div>
            <span className="turn-badge">🎲 Sıra: {activePlayer?.name ?? 'Yükleniyor'}</span>
          </div>

          {spinningWheel ? (
            <div className="news-wheel-anim">
              <div className="wheel-spinner">🎡</div>
              <h2>Haber Çarkı Dönüyor...</h2>
              <p>Piyasayı etkileyecek son dakika haberi çekiliyor.</p>
            </div>
          ) : latestNews ? (
            <article className="news-card">
              <div className="news-card-header">
                <span>📰 Son Dakika · Tur {latestNews.round_number} / 12</span>
                <span className="news-id-badge">Haber #{latestNews.news_id || latestNews.news?.id}</span>
              </div>
              <h2>{latestNews.news?.haber_metni}</h2>

              {/* Asset Impact Badges */}
              <div className="impact-grid">
                {newsImpacts.map(({ key, label, icon, pctChange }) => (
                  <div
                    className={`impact-badge ${pctChange > 0 ? 'positive' : pctChange < 0 ? 'negative' : 'neutral'}`}
                    key={key}
                  >
                    <span>{icon} {label}</span>
                    <strong>{pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`}</strong>
                  </div>
                ))}
              </div>
            </article>
          ) : (
            <article className="news-card waiting-news">
              <span>📢 İlk Haber Bekleniyor</span>
              <h2>Sırası gelen oyuncu haber çarkını başlatsın.</h2>
            </article>
          )}

          <button
            className="primary-button full-width spin-button"
            disabled={loading || activePlayer?.id !== playerId}
            type="button"
            onClick={drawNews}
          >
            {spinningWheel
              ? '🎡 Çark Dönüyor...'
              : activePlayer?.id === playerId
              ? '🎲 Haber Çek (Çarkı Çevir)'
              : `⏳ Sıra ${activePlayer?.name ?? 'Diğer oyuncu'} isimli oyuncuda`}
          </button>

          {/* Leaderboard & Portfolio Values */}
          <div className="portfolio-list">
            <span className="list-title">Güncel Oyuncu Varlıkları (Sıralama)</span>
            {rankedPlayers.map((player, idx) => (
              <div className="player-rank-card" key={player.id}>
                <div className="player-row">
                  <span>#{idx + 1} · 👤 {player.name}{player.id === playerId ? ' (Sen)' : ''}</span>
                  <strong>{formatCurrency(player.total_value)}</strong>
                </div>

                {/* Individual Asset Breakdown */}
                <div className="asset-mini-breakdown">
                  {investmentOptions.map(({ key, label, icon }) => (
                    <div className="mini-asset-chip" key={key}>
                      <span>{icon} {label}</span>
                      <strong>{formatCurrency(Number(player[key]) || 0)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {message && <p className="status-message">{message}</p>}
        </section>
      </main>
    )
  }

  if (screen === 'portfolio') {
    const allocatedPercentage = Math.min(100, Math.max(0, (portfolioTotal / INITIAL_BUDGET) * 100))

    return (
      <main className="app-shell">
        <section className="portfolio-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Başlangıç Portföyü</span>
              <h1>1.000.000 TL'yi Dağıt</h1>
            </div>
            <button className="text-button" type="button" onClick={() => setScreen('lobby')}>Lobiye Dön</button>
          </div>

          <div className="progress-container">
            <div className="progress-header">
              <span>Portföy Tamamlanma</span>
              <strong>%{allocatedPercentage.toFixed(0)}</strong>
            </div>
            <div className="progress-bar-track">
              <div
                className={`progress-bar-fill ${allocatedPercentage === 100 ? 'complete' : allocatedPercentage > 100 ? 'invalid' : ''}`}
                style={{ width: `${allocatedPercentage}%` }}
              />
            </div>
          </div>

          <div className="budget-panel">
            <div>
              <span>Kalan Bütçe</span>
              <strong className={remainingBudget === 0 ? 'complete' : remainingBudget < 0 ? 'invalid' : ''}>
                {formatCurrency(remainingBudget)}
              </strong>
            </div>
            <div className="preset-buttons">
              <button className="small-button" type="button" onClick={distributeEqually}>⚖️ Eşit Dağıt</button>
              <button className="small-button outline" type="button" onClick={resetPortfolio}>🔄 Sıfırla</button>
            </div>
          </div>

          <div className="kpi-grid">
            {investmentOptions.map(({ key, label, icon, color }) => {
              const currentVal = Number(portfolio[key]) || 0
              const maxAllowed = currentVal + Math.max(0, remainingBudget)
              const sharePct = ((currentVal / INITIAL_BUDGET) * 100).toFixed(1)

              return (
                <div className="kpi-card" key={key} style={{ borderTopColor: color }}>
                  <div className="kpi-card-header">
                    <span className="kpi-asset-title">{icon} {label}</span>
                    <span className="kpi-share-badge">%{sharePct}</span>
                  </div>

                  <div className="kpi-value-row">
                    <strong className="kpi-amount">{formatCurrency(currentVal)}</strong>
                    <input
                      className="kpi-direct-input"
                      inputMode="numeric"
                      min="0"
                      max={maxAllowed}
                      type="number"
                      value={portfolio[key]}
                      onChange={(event) => handlePortfolioInput(key, event.target.value)}
                    />
                  </div>

                  <div className="stepper-bar">
                    <button
                      className="stepper-btn dec"
                      disabled={currentVal <= 0}
                      type="button"
                      onClick={() => adjustPortfolioAsset(key, -50000)}
                    >
                      -50K
                    </button>
                    <button
                      className="stepper-btn dec"
                      disabled={currentVal <= 0}
                      type="button"
                      onClick={() => adjustPortfolioAsset(key, -20000)}
                    >
                      -20K
                    </button>
                    <button
                      className="stepper-btn inc"
                      disabled={remainingBudget <= 0}
                      type="button"
                      onClick={() => adjustPortfolioAsset(key, 20000)}
                    >
                      +20K
                    </button>
                    <button
                      className="stepper-btn inc"
                      disabled={remainingBudget <= 0}
                      type="button"
                      onClick={() => adjustPortfolioAsset(key, 50000)}
                    >
                      +50K
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="portfolio-footer">
            <span>Toplam Dağıtılan: <strong>{formatCurrency(portfolioTotal)}</strong></span>
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
        <p className="intro">Haberleri doğru okuyup 1.000.000 TL bütçenle en güçlü portföyü oluştur.</p>
        {!gameId ? (
          <div className="join-grid">
            <label>Oyuncu Adı<input maxLength="40" placeholder="Adınızı girin" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <div className="action-card">
              <h2>🎮 Yeni Oyun Oluştur</h2>
              <p>Bir oda oluştur ve oda kodunu diğer oyuncularla paylaş.</p>
              <button className="primary-button" disabled={loading} type="button" onClick={createGame}>{loading ? 'Oluşturuluyor...' : 'Oda Oluştur'}</button>
            </div>
            <div className="action-card">
              <h2>🔑 Oyuna Katıl</h2>
              <input placeholder="Oda kodunu girin" value={joinGameId} onChange={(event) => setJoinGameId(event.target.value)} />
              <button className="secondary-button" disabled={loading} type="button" onClick={joinGame}>{loading ? 'Katılınıyor...' : 'Odaya Katıl'}</button>
            </div>
          </div>
        ) : (
          <div className="room-view">
            <div className="room-code">
              <div className="room-code-header">
                <span>Oda Kodu</span>
                <button className="copy-button" type="button" onClick={copyRoomCode}>
                  {copied ? '✅ Kopyalandı!' : '📋 Kopyala'}
                </button>
              </div>
              <code>{gameId}</code>
            </div>
            <div className="player-list">
              <span className="list-title">Oyuncular ({players.length})</span>
              {players.map((player) => (
                <div className="player-row" key={player.id}>
                  <span>👤 {player.name}{player.id === playerId ? ' (Sen)' : ''}</span>
                  <strong className={isPortfolioComplete(player) ? 'ready' : 'waiting'}>
                    {isPortfolioComplete(player) ? '✅ Portföy Hazır' : '⏳ Portföy Bekleniyor'}
                  </strong>
                </div>
              ))}
            </div>
            {isPortfolioComplete(currentPlayer ?? {}) ? (
              <>
                <button className="primary-button full-width start-game-btn" disabled={loading} type="button" onClick={startGameNow}>
                  🚀 Oyuna Başla (Haber Çarkına Geç)
                </button>
                <button className="secondary-button full-width" type="button" onClick={() => setScreen('portfolio')}>
                  ✏️ Portföyünü Düzenle
                </button>
              </>
            ) : (
              <button className="primary-button full-width" type="button" onClick={() => setScreen('portfolio')}>
                💰 Portföyünü Oluştur (1.000.000 TL)
              </button>
            )}
            <button className="text-button" type="button" onClick={leaveGame}>Odadan Ayrıl</button>
          </div>
        )}
        {message && <p className="status-message">{message}</p>}
      </section>
    </main>
  )
}

export default App
