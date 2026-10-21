/**
 * Valentus: boot aside page TOC after Default UI site.js.
 * Defines window.ValentusPageToc when missing, then rebuilds on DOMContentLoaded.
 * Runtime body is duplicated in soft-nav-page-toc ui/js/page-toc-runtime.js — keep in sync.
 */
;(function () {
  'use strict'

  if (window.ValentusPageToc) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.ValentusPageToc.rebuild()
      })
    } else {
      window.ValentusPageToc.rebuild()
    }
    return
  }

  var TOC_ROOT_SEL = '[data-page-toc-root], [data-zone="body"]'
  var TOC_TITLE_SEL = '[data-zone="header"], [data-page-toc-title]'
  var scrollHandler = null

  function resolveTocRoot (article) {
    if (!article) return null
    return article.querySelector(TOC_ROOT_SEL) || article
  }

  function buildSectionLevelSelector (level) {
    if (level < 1) return null
    var segs = []
    for (var c = 1; c <= level; c++) {
      if (c === 1) segs.push('.sect' + c)
      else segs.push('>' + (c === 2 ? '.sectionbody>' : '') + '.sect' + c)
    }
    segs.push('>h' + (level + 1) + '[id]' + (level > 1 ? ':not(.discrete)' : ''))
    return segs.join('')
  }

  function collectTitleHeadings (article) {
    var found = []
    var seen = {}
    function add (h) {
      if (h && h.id && !seen[h.id]) {
        seen[h.id] = true
        found.push(h)
      }
    }
    var titleRoot = article.querySelector(TOC_TITLE_SEL)
    if (titleRoot) add(titleRoot.querySelector('h1[id]'))
    add(article.querySelector('h1[id].sect0'))
    try {
      add(article.querySelector(':scope > h1[id]'))
    } catch (_) {}
    return found
  }

  function mergeHeadingsInDocumentOrder (lists) {
    var all = []
    var seen = {}
    lists.forEach(function (list) {
      list.forEach(function (h) {
        if (!seen[h.id]) {
          seen[h.id] = true
          all.push(h)
        }
      })
    })
    all.sort(function (a, b) {
      var pos = a.compareDocumentPosition(b)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
    return all
  }

  function collectHeadings (article, levels) {
    if (!article) return []
    var tocRoot = resolveTocRoot(article)
    var lists = [collectTitleHeadings(article)]
    for (var i = 1; i <= levels; i++) {
      var sel = buildSectionLevelSelector(i)
      if (sel) lists.push([].slice.call(tocRoot.querySelectorAll(sel)))
    }
    return mergeHeadingsInDocumentOrder(lists)
  }

  function parsePx (el, prop) {
    return parseFloat(window.getComputedStyle(el)[prop])
  }

  function removeAside (aside) {
    if (aside && aside.parentNode) aside.parentNode.removeChild(aside)
  }

  function ensureAside (prior) {
    var aside = document.querySelector('aside.toc.sidebar')
    if (aside) return aside
    var shell = document.querySelector('.body.valentus-body')
    if (!shell) return null
    aside = document.createElement('aside')
    aside.className = 'toc sidebar'
    aside.dataset.title = (prior && prior.title) || 'Contents'
    aside.dataset.levels = (prior && prior.levels) || '2'
    aside.innerHTML = '<div class="toc-menu"></div>'
    shell.appendChild(aside)
    return aside
  }

  function rebuildPageToc () {
    if (document.querySelector('body.-toc')) {
      var gone = document.querySelector('aside.toc.sidebar')
      if (gone) removeAside(gone)
      return
    }

    var prior = null
    var existing = document.querySelector('aside.toc.sidebar')
    if (existing) {
      prior = { title: existing.dataset.title, levels: existing.dataset.levels }
    }

    var aside = ensureAside(prior)
    if (!aside) return

    var levels = parseInt(aside.dataset.levels || '2', 10)
    if (levels < 0) return

    var article = document.querySelector('article.doc')
    if (!article) return

    var headings = collectHeadings(article, levels)
    if (!headings.length) {
      removeAside(aside)
      return
    }

    var linkByHash = {}
    var list = headings.reduce(function (ul, heading) {
      var a = document.createElement('a')
      a.textContent = heading.textContent
      var href = '#' + heading.id
      a.setAttribute('href', href)
      linkByHash[href] = a
      var li = document.createElement('li')
      li.dataset.level = String(parseInt(heading.nodeName.slice(1), 10) - 1)
      li.appendChild(a)
      ul.appendChild(li)
      return ul
    }, document.createElement('ul'))

    var menu = aside.querySelector('.toc-menu')
    if (!menu) {
      menu = document.createElement('div')
      menu.className = 'toc-menu'
      aside.appendChild(menu)
    }
    menu.innerHTML = ''
    var title = document.createElement('h3')
    title.textContent = aside.dataset.title || 'Contents'
    menu.appendChild(title)
    menu.appendChild(list)

    bindScrollSpy(aside, menu, headings, linkByHash)
  }

  function bindScrollSpy (aside, menu, headings, linkByHash) {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler)
      scrollHandler = null
    }

    var tocList = menu.querySelector('ul')
    if (!tocList) return

    var activeStack
    var article = document.querySelector('article.doc')
    var topOffset = article ? article.getBoundingClientRect().top + window.pageYOffset : 0
    var fontSize = parsePx(document.documentElement, 'fontSize') * 1.15

    scrollHandler = function () {
      var scrollY = window.pageYOffset
      var atBottom =
        scrollY &&
        window.innerHeight + scrollY + 2 >= document.documentElement.scrollHeight

      if (atBottom) {
        activeStack = Array.isArray(activeStack) ? activeStack : Array(activeStack || 0)
        var visible = []
        var last = headings.length - 1
        headings.forEach(function (h, idx) {
          var hash = '#' + h.id
          if (
            idx === last ||
            h.getBoundingClientRect().top + parsePx(h, 'paddingTop') > topOffset
          ) {
            visible.push(hash)
            if (activeStack.indexOf(hash) < 0) linkByHash[hash].classList.add('is-active')
          } else if (~activeStack.indexOf(hash)) {
            linkByHash[activeStack.shift()].classList.remove('is-active')
          }
        })
        activeStack = visible.length > 1 ? visible : visible[0]
        return
      }

      if (Array.isArray(activeStack)) {
        activeStack.forEach(function (hash) {
          linkByHash[hash].classList.remove('is-active')
        })
        activeStack = undefined
      }

      var current
      headings.some(function (h) {
        if (h.getBoundingClientRect().top + parsePx(h, 'paddingTop') - fontSize > topOffset) {
          return true
        }
        current = '#' + h.id
      })

      if (current) {
        if (current !== activeStack) {
          if (activeStack) linkByHash[activeStack].classList.remove('is-active')
          var link = linkByHash[current]
          link.classList.add('is-active')
          if (tocList.scrollHeight > tocList.offsetHeight) {
            tocList.scrollTop = Math.max(0, link.offsetTop + link.offsetHeight - tocList.offsetHeight)
          }
          activeStack = current
        }
      } else if (activeStack) {
        linkByHash[activeStack].classList.remove('is-active')
        activeStack = undefined
      }
    }

    window.addEventListener('scroll', scrollHandler, { passive: true })
    scrollHandler()
  }

  window.ValentusPageToc = { rebuild: rebuildPageToc, collectHeadings: collectHeadings }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rebuildPageToc)
  } else {
    rebuildPageToc()
  }
})()
