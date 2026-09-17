// Local File & State Store for Muz Cumhuriyeti Finans Oyunu
// Replaces Supabase database with local news.csv reading and localStorage/BroadcastChannel sync.

const STORAGE_KEYS = {
  GAMES: 'finans_games_data',
  PLAYERS: 'finans_players_data',
  GAME_NEWS: 'finans_game_news_data',
  SNAPSHOTS: 'finans_snapshots_data',
  REBALANCES: 'finans_rebalances_data',
  TOP10: 'finans_top10_data',
}

const investmentKeys = [
  'hisse',
  'fon',
  'eurobond',
  'altin',
  'gumus',
  'faiz',
  'viop',
  'tahvil',
]

// BroadcastChannel for multi-tab realtime sync
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('finans_game_channel') : null

let newsCache = null

export async function getTop10() {
  const stored = getStored(STORAGE_KEYS.TOP10)
  if (stored && stored.length > 0) {
    return stored.sort((a, b) => b.total_value - a.total_value)
  }
  try {
    const response = await fetch('/top10.json')
    const json = await response.json()
    setStored(STORAGE_KEYS.TOP10, json)
    return json.sort((a, b) => b.total_value - a.total_value)
  } catch (err) {
    console.error('Error fetching top10.json:', err)
    return []
  }
}

export async function checkAndSaveTop10(playerName, totalValue, bestAssetLabel = '-') {
  const currentList = await getTop10()
  const netProfit = totalValue - 1000000
  const roiPct = (netProfit / 1000000) * 100

  // Eligible if top 10 has less than 10 items OR score is higher than the 10th score
  const isEligible = currentList.length < 10 || totalValue > (currentList[currentList.length - 1]?.total_value ?? 0)

  if (!isEligible) {
    return { isTop10: false, rank: null, top10List: currentList }
  }

  const newEntry = {
    id: generateId(),
    name: playerName,
    total_value: totalValue,
    net_profit: netProfit,
    roi_pct: Number(roiPct.toFixed(1)),
    best_asset: bestAssetLabel,
    date: new Date().toISOString().split('T')[0],
  }

  const updatedList = [...currentList, newEntry]
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, 10)

  setStored(STORAGE_KEYS.TOP10, updatedList)

  const rank = updatedList.findIndex((item) => item.id === newEntry.id) + 1

  return {
    isTop10: true,
    rank: rank > 0 ? rank : null,
    top10List: updatedList,
  }
}


// Parse CSV text into news objects
function parseNewsCsv(csvText) {
  const lines = csvText.trim().split('\n')
  if (lines.length <= 1) return []
  
  const headers = lines[0].split(',').map((h) => h.trim())
  const newsList = []

  for (let index = 1; index < lines.length; index++) {
    const line = lines[index].trim()
    if (!line) continue

    // Handle CSV row split (simple split assuming no commas inside text)
    const cols = line.split(',').map((c) => c.trim())
    if (cols.length < 9) continue

    newsList.push({
      id: index,
      haber_metni: cols[0],
      hisse_etki: parseFloat(cols[1]) || 1.0,
      fon_etki: parseFloat(cols[2]) || 1.0,
      eurobond_etki: parseFloat(cols[3]) || 1.0,
      altin_etki: parseFloat(cols[4]) || 1.0,
      gumus_etki: parseFloat(cols[5]) || 1.0,
      faiz_etki: parseFloat(cols[6]) || 1.0,
      viop_etki: parseFloat(cols[7]) || 1.0,
      tahvil_etki: parseFloat(cols[8]) || 1.0,
    })
  }

  return newsList
}

export async function loadNews() {
  if (newsCache) return newsCache
  try {
    const response = await fetch('/news.csv')
    const text = await response.text()
    newsCache = parseNewsCsv(text)
    return newsCache
  } catch (error) {
    console.error('Error loading news.csv:', error)
    return []
  }
}

// Local Storage Helper Functions
function getStored(key, defaultValue = []) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

function setStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    if (channel) {
      channel.postMessage({ type: 'STORAGE_UPDATE', key })
    }
  } catch (err) {
    console.error('Error saving to storage:', err)
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// Public API matching previous Supabase functions
export async function loadGameData(gameId) {
  const games = getStored(STORAGE_KEYS.GAMES)
  const players = getStored(STORAGE_KEYS.PLAYERS)
  const gameNews = getStored(STORAGE_KEYS.GAME_NEWS)
  const snapshots = getStored(STORAGE_KEYS.SNAPSHOTS)
  const rebalances = getStored(STORAGE_KEYS.REBALANCES)

  const game = games.find((g) => g.id === gameId) || null
  const gamePlayers = players.filter((p) => p.game_id === gameId)
  const gameNewsList = gameNews
    .filter((gn) => gn.game_id === gameId)
    .sort((a, b) => b.round_number - a.round_number)
  
  const latestNews = gameNewsList.length > 0 ? gameNewsList[0] : null
  const gameSnapshots = snapshots.filter((s) => s.game_id === gameId)
  const gameRebalances = rebalances.filter((r) => r.game_id === gameId)

  return {
    game,
    players: gamePlayers,
    latestNews,
    snapshots: gameSnapshots,
    rebalances: gameRebalances,
  }
}

export async function createGame(playerName) {
  const gameId = generateRoomCode()
  const playerId = generateId()
  const now = new Date().toISOString()

  const newGame = {
    id: gameId,
    status: 'waiting',
    current_turn_index: 0,
    round_count: 0,
    drawn_news_ids: [],
    rebalance_ends_at: null,
    created_at: now,
  }

  const newPlayer = {
    id: playerId,
    game_id: gameId,
    name: playerName,
    total_value: 1000000,
    hisse: 0,
    fon: 0,
    eurobond: 0,
    altin: 0,
    gumus: 0,
    faiz: 0,
    viop: 0,
    tahvil: 0,
    created_at: now,
  }

  const games = getStored(STORAGE_KEYS.GAMES)
  const players = getStored(STORAGE_KEYS.PLAYERS)

  games.push(newGame)
  players.push(newPlayer)

  setStored(STORAGE_KEYS.GAMES, games)
  setStored(STORAGE_KEYS.PLAYERS, players)

  return { game: newGame, player: newPlayer }
}

export async function joinGame(gameId, playerName) {
  const games = getStored(STORAGE_KEYS.GAMES)
  const game = games.find((g) => g.id === gameId)

  if (!game) throw new Error('Oyun odası bulunamadı.')
  if (game.status !== 'waiting') throw new Error('Bu oyun odasına artık katılım yapılamaz.')

  const playerId = generateId()
  const now = new Date().toISOString()

  const newPlayer = {
    id: playerId,
    game_id: gameId,
    name: playerName,
    total_value: 1000000,
    hisse: 0,
    fon: 0,
    eurobond: 0,
    altin: 0,
    gumus: 0,
    faiz: 0,
    viop: 0,
    tahvil: 0,
    created_at: now,
  }

  const players = getStored(STORAGE_KEYS.PLAYERS)
  players.push(newPlayer)
  setStored(STORAGE_KEYS.PLAYERS, players)

  return { game, player: newPlayer }
}

export async function confirmPortfolio(gameId, playerId, portfolio) {
  const players = getStored(STORAGE_KEYS.PLAYERS)
  const playerIndex = players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1) throw new Error('Oyuncu bulunamadı.')

  const updatedPlayer = { ...players[playerIndex] }
  investmentKeys.forEach((key) => {
    updatedPlayer[key] = Number(portfolio[key]) || 0
  })

  players[playerIndex] = updatedPlayer
  setStored(STORAGE_KEYS.PLAYERS, players)

  // Check if all players in game confirmed their portfolio
  const roomPlayers = players.filter((p) => p.game_id === gameId)
  const allReady = roomPlayers.every((p) => {
    const sum = investmentKeys.reduce((acc, k) => acc + Number(p[k] || 0), 0)
    return Math.round(sum) === Math.round(Number(p.total_value))
  })

  if (allReady) {
    const games = getStored(STORAGE_KEYS.GAMES)
    const gameIndex = games.findIndex((g) => g.id === gameId)
    if (gameIndex !== -1) {
      games[gameIndex].status = 'playing'
      setStored(STORAGE_KEYS.GAMES, games)

      // Save starting snapshots for analytics
      const snapshots = getStored(STORAGE_KEYS.SNAPSHOTS)
      roomPlayers.forEach((p) => {
        snapshots.push({
          id: generateId(),
          game_id: gameId,
          player_id: p.id,
          hisse: p.hisse,
          fon: p.fon,
          eurobond: p.eurobond,
          altin: p.altin,
          gumus: p.gumus,
          faiz: p.faiz,
          viop: p.viop,
          tahvil: p.tahvil,
          total_value: p.total_value,
        })
      })
      setStored(STORAGE_KEYS.SNAPSHOTS, snapshots)
    }
  }

  return updatedPlayer
}

export async function startGame(gameId) {
  const games = getStored(STORAGE_KEYS.GAMES)
  const gameIndex = games.findIndex((g) => g.id === gameId)
  if (gameIndex === -1) throw new Error('Oyun bulunamadı.')

  const game = games[gameIndex]
  const roomPlayers = getStored(STORAGE_KEYS.PLAYERS).filter((p) => p.game_id === gameId)

  // Ensure at least 1 player has complete portfolio
  const readyPlayers = roomPlayers.filter((p) => {
    const sum = investmentKeys.reduce((acc, k) => acc + Number(p[k] || 0), 0)
    return Math.round(sum) === Math.round(Number(p.total_value))
  })

  if (readyPlayers.length === 0) {
    throw new Error('Oyuna başlamak için en az 1 oyuncunun portföyünü onaylaması gerekir.')
  }

  game.status = 'playing'
  games[gameIndex] = game
  setStored(STORAGE_KEYS.GAMES, games)

  // Save starting snapshots for analytics
  const snapshots = getStored(STORAGE_KEYS.SNAPSHOTS)
  roomPlayers.forEach((p) => {
    if (!snapshots.some((s) => s.game_id === gameId && s.player_id === p.id)) {
      snapshots.push({
        id: generateId(),
        game_id: gameId,
        player_id: p.id,
        hisse: p.hisse,
        fon: p.fon,
        eurobond: p.eurobond,
        altin: p.altin,
        gumus: p.gumus,
        faiz: p.faiz,
        viop: p.viop,
        tahvil: p.tahvil,
        total_value: p.total_value,
      })
    }
  })
  setStored(STORAGE_KEYS.SNAPSHOTS, snapshots)

  return game
}


export async function drawNews(gameId, playerId) {
  const games = getStored(STORAGE_KEYS.GAMES)
  const gameIndex = games.findIndex((g) => g.id === gameId)
  if (gameIndex === -1) throw new Error('Oyun bulunamadı.')

  const game = games[gameIndex]
  const players = getStored(STORAGE_KEYS.PLAYERS).filter((p) => p.game_id === gameId)
  if (players.length === 0) throw new Error('Oyuncu bulunamadı.')

  // Check turn
  const activePlayer = players[game.current_turn_index % players.length]
  if (activePlayer.id !== playerId) throw new Error('Sıra sende değil!')

  const allNews = await loadNews()
  const drawnIds = game.drawn_news_ids || []
  const availableNews = allNews.filter((n) => !drawnIds.includes(n.id))

  if (availableNews.length === 0) throw new Error('Tüm haberler kullanıldı!')

  // Pick random news
  const selectedNews = availableNews[Math.floor(Math.random() * availableNews.length)]
  drawnIds.push(selectedNews.id)
  game.drawn_news_ids = drawnIds
  game.round_count += 1

  // Apply news impact to ALL players in the room
  const allPlayers = getStored(STORAGE_KEYS.PLAYERS)
  allPlayers.forEach((p, idx) => {
    if (p.game_id === gameId) {
      p.hisse = Math.round(p.hisse * selectedNews.hisse_etki)
      p.fon = Math.round(p.fon * selectedNews.fon_etki)
      p.eurobond = Math.round(p.eurobond * selectedNews.eurobond_etki)
      p.altin = Math.round(p.altin * selectedNews.altin_etki)
      p.gumus = Math.round(p.gumus * selectedNews.gumus_etki)
      p.faiz = Math.round(p.faiz * selectedNews.faiz_etki)
      p.viop = Math.round(p.viop * selectedNews.viop_etki)
      p.tahvil = Math.round(p.tahvil * selectedNews.tahvil_etki)

      p.total_value = investmentKeys.reduce((sum, k) => sum + p[k], 0)
      allPlayers[idx] = p
    }
  })
  setStored(STORAGE_KEYS.PLAYERS, allPlayers)

  // Record news draw
  const gameNews = getStored(STORAGE_KEYS.GAME_NEWS)
  const newsRecord = {
    id: generateId(),
    game_id: gameId,
    round_number: game.round_count,
    drawn_at: new Date().toISOString(),
    news: selectedNews,
  }
  gameNews.push(newsRecord)
  setStored(STORAGE_KEYS.GAME_NEWS, gameNews)

  // Check end game or rebalance trigger (9 rounds total)
  const MAX_ROUNDS = 9
  if (game.round_count >= MAX_ROUNDS) {
    game.status = 'finished'
  } else if (game.round_count % 3 === 0) {
    // Rebalance trigger every 3 rounds (round 3 and round 6)
    game.status = 'rebalancing'
    game.rebalance_ends_at = new Date(Date.now() + 2 * 60 * 1000).toISOString()
    // Clear previous rebalances
    const rebalances = getStored(STORAGE_KEYS.REBALANCES).filter((r) => r.game_id !== gameId)
    setStored(STORAGE_KEYS.REBALANCES, rebalances)
  } else {
    // Advance turn
    game.current_turn_index = (game.current_turn_index + 1) % players.length
  }

  games[gameIndex] = game
  setStored(STORAGE_KEYS.GAMES, games)

  return newsRecord
}

export async function submitRebalance(gameId, playerId, portfolio) {
  const games = getStored(STORAGE_KEYS.GAMES)
  const gameIndex = games.findIndex((g) => g.id === gameId)
  if (gameIndex === -1) throw new Error('Oyun bulunamadı.')

  const game = games[gameIndex]
  if (game.status !== 'rebalancing') throw new Error('Yeniden dağıtım turunda değilsiniz.')

  // Update player portfolio
  const allPlayers = getStored(STORAGE_KEYS.PLAYERS)
  const playerIndex = allPlayers.findIndex((p) => p.id === playerId)
  if (playerIndex !== -1) {
    investmentKeys.forEach((key) => {
      allPlayers[playerIndex][key] = Number(portfolio[key]) || 0
    })
    allPlayers[playerIndex].total_value = investmentKeys.reduce(
      (sum, k) => sum + allPlayers[playerIndex][k],
      0,
    )
    setStored(STORAGE_KEYS.PLAYERS, allPlayers)
  }

  // Record rebalance ready
  const rebalances = getStored(STORAGE_KEYS.REBALANCES)
  if (!rebalances.some((r) => r.game_id === gameId && r.player_id === playerId)) {
    rebalances.push({
      id: generateId(),
      game_id: gameId,
      player_id: playerId,
      submitted_at: new Date().toISOString(),
    })
    setStored(STORAGE_KEYS.REBALANCES, rebalances)
  }

  // Check if all players are ready
  const roomPlayers = allPlayers.filter((p) => p.game_id === gameId)
  const roomRebalances = rebalances.filter((r) => r.game_id === gameId)

  if (roomRebalances.length >= roomPlayers.length) {
    game.status = 'playing'
    game.rebalance_ends_at = null
    game.current_turn_index = (game.current_turn_index + 1) % roomPlayers.length
    games[gameIndex] = game
    setStored(STORAGE_KEYS.GAMES, games)
  }

  return true
}

export async function finishRebalanceIfDue(gameId) {
  const games = getStored(STORAGE_KEYS.GAMES)
  const gameIndex = games.findIndex((g) => g.id === gameId)
  if (gameIndex === -1) return

  const game = games[gameIndex]
  if (game.status !== 'rebalancing') return

  if (game.rebalance_ends_at && new Date(game.rebalance_ends_at).getTime() <= Date.now()) {
    const roomPlayers = getStored(STORAGE_KEYS.PLAYERS).filter((p) => p.game_id === gameId)
    game.status = 'playing'
    game.rebalance_ends_at = null
    game.current_turn_index = (game.current_turn_index + 1) % (roomPlayers.length || 1)
    games[gameIndex] = game
    setStored(STORAGE_KEYS.GAMES, games)
  }
}

export async function restartGame(gameId) {
  const games = getStored(STORAGE_KEYS.GAMES)
  const gameIndex = games.findIndex((g) => g.id === gameId)
  if (gameIndex === -1) throw new Error('Oyun bulunamadı.')

  const game = games[gameIndex]
  game.status = 'waiting'
  game.current_turn_index = 0
  game.round_count = 0
  game.drawn_news_ids = []
  game.rebalance_ends_at = null

  // Reset all players in the room
  const allPlayers = getStored(STORAGE_KEYS.PLAYERS)
  allPlayers.forEach((p, idx) => {
    if (p.game_id === gameId) {
      p.total_value = 1000000
      investmentKeys.forEach((key) => {
        p[key] = 0
      })
      allPlayers[idx] = p
    }
  })
  setStored(STORAGE_KEYS.PLAYERS, allPlayers)

  // Clear snapshots, game news, and rebalances for this game
  const snapshots = getStored(STORAGE_KEYS.SNAPSHOTS).filter((s) => s.game_id !== gameId)
  const gameNews = getStored(STORAGE_KEYS.GAME_NEWS).filter((gn) => gn.game_id !== gameId)
  const rebalances = getStored(STORAGE_KEYS.REBALANCES).filter((r) => r.game_id !== gameId)

  setStored(STORAGE_KEYS.SNAPSHOTS, snapshots)
  setStored(STORAGE_KEYS.GAME_NEWS, gameNews)
  setStored(STORAGE_KEYS.REBALANCES, rebalances)

  games[gameIndex] = game
  setStored(STORAGE_KEYS.GAMES, games)

  return game
}

export function subscribeToGame(gameId, callback) {
  const handler = () => {
    loadGameData(gameId).then(callback)
  }

  // Window storage event (fires across tabs)
  window.addEventListener('storage', handler)

  // Broadcast channel listener
  let bcHandler = null
  if (channel) {
    bcHandler = (event) => {
      if (event.data?.type === 'STORAGE_UPDATE') {
        handler()
      }
    }
    channel.addEventListener('message', bcHandler)
  }

  return () => {
    window.removeEventListener('storage', handler)
    if (channel && bcHandler) {
      channel.removeEventListener('message', bcHandler)
    }
  }
}

