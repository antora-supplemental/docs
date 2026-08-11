/**
 * KaTeX for AsciiDoc stem / LaTeX math on Antora pages.
 * Pair with playbook attribute: stem: latexmath
 * Asciidoctor emits \( … \) and \[ … \] which KaTeX auto-render understands.
 */
;(function () {
  const KATEX_VER = '0.16.22'
  const CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VER}/dist/katex.min.css`
  const KATEX_JS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VER}/dist/katex.min.js`
  const AUTO_JS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VER}/dist/contrib/auto-render.min.js`

  function loadCss(href) {
    if (document.querySelector(`link[data-adt-katex="${href}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.adtKatex = href
    document.head.appendChild(link)
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-adt-katex="${src}"]`)
      if (existing) {
        if (existing.dataset.loaded === '1') resolve()
        else {
          existing.addEventListener('load', () => resolve())
          existing.addEventListener('error', reject)
        }
        return
      }
      const s = document.createElement('script')
      s.src = src
      s.defer = true
      s.dataset.adtKatex = src
      s.onload = () => {
        s.dataset.loaded = '1'
        resolve()
      }
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  async function boot() {
    loadCss(CSS)
    await loadScript(KATEX_JS)
    await loadScript(AUTO_JS)
    if (typeof window.renderMathInElement !== 'function') return
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '$$', right: '$$', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
      strict: 'ignore',
    })
  }

  function start() {
    boot().catch((err) => console.warn('[adt-math]', err))
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
