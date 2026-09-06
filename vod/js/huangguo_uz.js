// ignore
//@name:黄果短剧
//@webSite:https://huangguoai.com
//@version:1
//@remark:由 XPTV huangguo.js 移植为 UZ type 101 扩展；部分加密封面可能无法显示
//@codeID:
//@env:
//@isAV:1
//@deprecated:0
// ignore

// Source attribution:
// https://github.com/Yswag/xptv-extensions/blob/main/js/huangguo.js

const HG_UZ_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const HG_UZ_TABS = [
  { type_name: '首页', type_id: 'home' },
  { type_name: 'AI成人短剧', type_id: 'ai-duanju' },
  { type_name: 'AI成人漫剧', type_id: 'ai-manju' },
  { type_name: 'AI换脸', type_id: 'ai-huanlian' },
  { type_name: 'AI魔改', type_id: 'ai-mogai' },
  { type_name: '排行榜', type_id: 'ranks/hot' },
]

// UZ 会给 appConfig.webSite 和 appConfig.uzTag 赋值，请勿改名。
const appConfig = {
  _webSite: 'https://huangguoai.com',
  _uzTag: '',

  get webSite() {
    return String(this._webSite || 'https://huangguoai.com').replace(/\/+$/, '')
  },
  set webSite(value) {
    this._webSite = String(value || 'https://huangguoai.com').replace(/\/+$/, '')
  },

  get uzTag() {
    return this._uzTag
  },
  set uzTag(value) {
    this._uzTag = value || ''
  },

  get headers() {
    return {
      'User-Agent': HG_UZ_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: this.webSite + '/',
    }
  },
}

function hgUzAbsoluteUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.indexOf('//') === 0) return 'https:' + value
  if (value.indexOf('/') === 0) return appConfig.webSite + value
  return value
}

function hgUzImageUrl(url) {
  // 与原 XPTV 脚本保持一致：去掉会过期的 auth_key 等查询参数。
  // 站点部分封面响应是 AES-CBC 加密字节，UZ 扩展层无法直接把解密后的
  // 二进制注册为图片 URL，因此这类封面仍需要外部图片解密代理。
  return hgUzAbsoluteUrl(url).replace(/\?.*$/, '')
}

function hgUzDecodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function hgUzFetchHtml(url, referer) {
  const headers = Object.assign({}, appConfig.headers)
  if (referer) headers.Referer = referer

  const response = await req(url, { headers: headers })
  if (!response) throw new Error('请求未返回结果：' + url)
  if (response.error) throw new Error(String(response.error))

  const data = response.data
  return typeof data === 'string' ? data : data == null ? '' : JSON.stringify(data)
}

function hgUzClassBlockStarts(html, className, tagName) {
  const tag = tagName || '[a-zA-Z0-9]+'
  const expression = new RegExp(
    "<" + tag + "\\b[^>]*class=[\"'][^\"']*\\b" + className + "\\b[^\"']*[\"'][^>]*>",
    'gi'
  )
  const starts = []
  let match
  while ((match = expression.exec(html)) !== null) {
    starts.push(match.index + match[0].length)
  }
  return starts
}

function hgUzSlicesFromStarts(html, starts) {
  const slices = []
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : html.length
    slices.push(html.slice(starts[i], end))
  }
  return slices
}

function hgUzParseCard(block) {
  const link = block.match(/href=["'][^"']*\/detail\/(\d+)\/?[^"']*["']/i)
  if (!link) return null

  const id = link[1]
  const image = block.match(/data-src=["']([^"']+)["']/i) || block.match(/src=["']([^"']+)["']/i)
  const titleMatch =
    block.match(/hg-drama-card__title[^>]*>([\s\S]*?)<\/a>/i) ||
    block.match(/<a\b[^>]*href=["'][^"']*\/detail\/\d+\/?[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
  const title = titleMatch ? hgUzDecodeHtml(titleMatch[1]) : ''
  if (!title) return null

  const episode = block.match(/hg-drama-card__episode[^>]*>([\s\S]*?)<\/span>/i)
  const score = block.match(/hg-drama-card__score[^>]*>([\s\S]*?)<\/span>/i)
  const episodeText = episode ? hgUzDecodeHtml(episode[1]) : ''
  const scoreText = score ? hgUzDecodeHtml(score[1]) : ''

  return {
    vod_id: id,
    vod_name: title,
    vod_pic: hgUzImageUrl(image ? image[1] : ''),
    vod_remarks: episodeText && scoreText ? episodeText + ' · ' + scoreText : episodeText || scoreText,
  }
}

function hgUzParseGridCards(html, allGrids) {
  if (!html) return []

  const gridStarts = hgUzClassBlockStarts(html, 'hg-card-grid', 'div')
  if (!gridStarts.length) return []

  const gridSlices = hgUzSlicesFromStarts(html, gridStarts)
  const selectedGrids = allGrids ? gridSlices : gridSlices.slice(0, 1)
  const result = []
  const seen = {}

  for (const grid of selectedGrids) {
    const cardStarts = hgUzClassBlockStarts(grid, 'hg-drama-card', 'div')
    const cards = hgUzSlicesFromStarts(grid, cardStarts)
    for (const card of cards) {
      try {
        const item = hgUzParseCard(card)
        if (!item || seen[item.vod_id]) continue
        seen[item.vod_id] = true
        result.push(item)
      } catch (_) {}
    }
  }

  return result
}

function hgUzParseRanks(html) {
  if (!html) return []

  const rankListStarts = hgUzClassBlockStarts(html, 'hg-rank-list', 'div')
  const rankArea = rankListStarts.length ? html.slice(rankListStarts[0]) : html
  const itemStarts = hgUzClassBlockStarts(rankArea, 'hg-rank-item', 'div')
  const result = []
  const seen = {}

  for (const block of hgUzSlicesFromStarts(rankArea, itemStarts)) {
    try {
      const link = block.match(/href=["'][^"']*\/detail\/(\d+)\/?[^"']*["']/i)
      if (!link || seen[link[1]]) continue

      const image = block.match(/data-src=["']([^"']+)["']/i) || block.match(/src=["']([^"']+)["']/i)
      const titleMatch =
        block.match(/hg-rank-item__title[^>]*>([\s\S]*?)<\/h2>/i) ||
        block.match(/<a\b[^>]*href=["'][^"']*\/detail\/\d+\/?[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
      const title = titleMatch ? hgUzDecodeHtml(titleMatch[1]) : ''
      if (!title) continue

      const tags = block.match(/hg-rank-item__tags[^>]*>([\s\S]*?)<\/div>/i)
      seen[link[1]] = true
      result.push({
        vod_id: link[1],
        vod_name: title,
        vod_pic: hgUzImageUrl(image ? image[1] : ''),
        vod_remarks: tags ? hgUzDecodeHtml(tags[1]) : '',
      })
    } catch (_) {}
  }

  return result
}

function hgUzEncodePlay(url, episode) {
  return 'hguz:' + encodeURIComponent(JSON.stringify({ url: url, ep: String(episode || '') }))
}

function hgUzDecodePlay(value) {
  const text = String(value || '')
  if (text.indexOf('hguz:') !== 0) return { url: hgUzAbsoluteUrl(text), ep: '1' }
  try {
    const parsed = JSON.parse(decodeURIComponent(text.slice(5)))
    return {
      url: hgUzAbsoluteUrl(parsed.url || ''),
      ep: String(parsed.ep || '1'),
    }
  } catch (_) {
    return { url: '', ep: '1' }
  }
}

function hgUzErrorText(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

// UZ type 101 固定入口：获取分类。
async function getClassList(args) {
  const response = new RepVideoClassList()
  try {
    response.data = HG_UZ_TABS.map(function (item) {
      return { type_name: item.type_name, type_id: item.type_id, hasSubclass: false }
    })
  } catch (error) {
    response.error = hgUzErrorText(error)
  }
  return JSON.stringify(response)
}

// 本扩展没有二级分类，但 UZ 101 接口要求保留此入口。
async function getSubclassList(args) {
  const response = new RepVideoSubclassList()
  response.data = new VideoSubclass()
  return JSON.stringify(response)
}

// UZ type 101 固定入口：获取列表。
async function getVideoList(args) {
  const response = new RepVideoList()
  try {
    const id = String((args && args.url) || 'home').replace(/^\/+|\/+$/g, '')
    const page = Math.max(1, parseInt(args && args.page, 10) || 1)
    let url
    let html

    if (id === 'home') {
      url = appConfig.webSite + '/'
      html = await hgUzFetchHtml(url)
      response.data = hgUzParseGridCards(html, true)
    } else {
      url = appConfig.webSite + '/' + id + '/' + (page > 1 ? page + '/' : '')
      html = await hgUzFetchHtml(url)
      response.data = id.indexOf('rank') !== -1 ? hgUzParseRanks(html) : hgUzParseGridCards(html, false)
    }
  } catch (error) {
    response.error = hgUzErrorText(error)
  }
  return JSON.stringify(response)
}

// 无二级分类；为兼容可能调用此入口的 UZ 版本，回落到普通列表。
async function getSubclassVideoList(args) {
  const mainClassId = args && (args.mainClassId || args.url)
  return getVideoList({ url: mainClassId || 'home', page: (args && args.page) || 1 })
}

// UZ type 101 固定入口：获取详情和播放列表。
async function getVideoDetail(args) {
  const response = new RepVideoDetail()
  try {
    const rawId = String((args && args.url) || '')
    const idMatch = rawId.match(/(?:\/detail\/)?(\d+)/)
    const id = idMatch ? idMatch[1] : ''
    if (!id) throw new Error('缺少视频 ID')

    const detailUrl = appConfig.webSite + '/detail/' + id + '/'
    const html = await hgUzFetchHtml(detailUrl)
    const tracks = []

    const gridStart = html.search(/<div\b[^>]*class=["'][^"']*\bhg-web-detail__ep-grid\b[^"']*["'][^>]*>/i)
    if (gridStart !== -1) {
      const gridTail = html.slice(gridStart)
      const gridEnd = gridTail.search(/<\/div>/i)
      const grid = gridEnd === -1 ? gridTail : gridTail.slice(0, gridEnd + 6)
      const anchorRegex = /<a\b[^>]*>[\s\S]*?<\/a>/gi
      let match
      while ((match = anchorRegex.exec(grid)) !== null) {
        const anchor = match[0]
        const href = anchor.match(/href=["']([^"']+)["']/i)
        if (!href) continue
        const episodeMatch = anchor.match(/data-ep-id=["']([^"']*)["']/i)
        const episode = episodeMatch ? episodeMatch[1] : ''
        const name = episode ? '第' + episode + '集' : hgUzDecodeHtml(anchor)
        tracks.push(name + '$' + hgUzEncodePlay(hgUzAbsoluteUrl(href[1]), episode))
      }
    }

    if (!tracks.length) {
      const fallback = html.match(
        /<a\b[^>]*class=["'][^"']*\bhg-web-detail__play\b[^"']*["'][^>]*href=["']([^"']+)["']/i
      )
      if (fallback) tracks.push('第1集$' + hgUzEncodePlay(hgUzAbsoluteUrl(fallback[1]), '1'))
    }

    const nameMatch =
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
    const imageMatch =
      html.match(/hg-web-detail__poster[\s\S]{0,500}?(?:data-src|src)=["']([^"']+)["']/i) ||
      html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    const descriptionMatch = html.match(/hg-web-detail__desc[^>]*>([\s\S]*?)<\/div>/i)

    response.data = {
      vod_id: id,
      vod_name: nameMatch ? hgUzDecodeHtml(nameMatch[1]) : '黄果短剧',
      vod_pic: hgUzImageUrl(imageMatch ? imageMatch[1] : ''),
      vod_content: descriptionMatch ? hgUzDecodeHtml(descriptionMatch[1]) : '',
      vod_play_from: '黄果短剧',
      vod_play_url: tracks.join('#'),
    }
  } catch (error) {
    response.error = hgUzErrorText(error)
  }
  return JSON.stringify(response)
}

// UZ type 101 固定入口：解析播放地址。
async function getVideoPlayUrl(args) {
  const response = new RepVideoPlayUrl()
  try {
    const playInfo = hgUzDecodePlay(args && args.url)
    if (!playInfo.url) throw new Error('缺少播放页地址')

    const html = await hgUzFetchHtml(playInfo.url, appConfig.webSite + '/')
    const initialData = html.match(/<script\b[^>]*id=["']videoInitialData["'][^>]*>([\s\S]*?)<\/script>/i)
    let playUrl = ''

    if (initialData) {
      try {
        const data = JSON.parse(initialData[1])
        const sources = (data && data.epPlaySrcs) || {}
        playUrl = sources[playInfo.ep] || (data && data.videoSrc) || ''
      } catch (_) {}
    }

    playUrl = String(playUrl || '').replace(/\\u0026/g, '&')
    if (playUrl && playUrl.indexOf('http') !== 0) {
      const urlMatch = playUrl.match(/https?:\/\/[^\s"']+/i)
      playUrl = urlMatch ? urlMatch[0] : ''
    }
    if (!playUrl) throw new Error('未找到播放地址，站点页面结构可能已变化')

    response.data = playUrl
    response.headers = {
      'User-Agent': HG_UZ_UA,
      Referer: appConfig.webSite + '/',
    }
  } catch (error) {
    response.error = hgUzErrorText(error)
  }
  return JSON.stringify(response)
}

// UZ type 101 固定入口：搜索。
async function searchVideo(args) {
  const response = new RepVideoList()
  try {
    const keyword = String((args && (args.searchWord || args.wd || args.text)) || '').trim()
    if (!keyword) {
      response.data = []
      return JSON.stringify(response)
    }

    const url = appConfig.webSite + '/search/video/' + encodeURIComponent(keyword) + '/'
    const html = await hgUzFetchHtml(url)
    response.data = hgUzParseGridCards(html, false)
  } catch (error) {
    response.error = hgUzErrorText(error)
  }
  return JSON.stringify(response)
}
