/** @file 站点适配档案：按 hostname/生成器匹配程序员站点，向 content.js 提供阅读根、
 * 跳过与构件（chrome）选择器；纯数据与匹配逻辑，无 DOM 依赖。 */
(() => {
  'use strict';
  // 通用代码块容器：所有站点都永不进阅读块与翻译单元。
  const GENERIC_SKIP = ['.CodeMirror', '.cm-editor', '.monaco-editor', '.ace_editor', 'table.highlight', '.hljs-ln'];
  const PROFILES = [
    {
      id: 'github',
      hosts: ['github.com', 'gist.github.com'],
      // 容器级阅读根：讨论串、Wiki、README。不要用 .comment-body / .markdown-body，否则每条评论各自成根，阅读辅助只会挂在最长的那一条上。
      root: ['#discussion_bucket', '#wiki-body', '#readme', 'article.markdown-body'],
      skip: [
        '.blob-code', '.blob-num', 'table.diff-table', '.js-file-line-container', '.react-code-lines', '.react-code-text', '.react-file-line', '.js-file', '.file-header', '[data-tagsearch-path]', '.diff-text', '[data-diff-anchor]',
        '[role="tree"]', '#repos-file-tree', '[class*="TreeView"]', 'table[aria-labelledby="folders-and-files"]', '.react-directory-filename-cell', '.react-directory-commit-message', '[data-testid="latest-commit-html"]',
        'a.author', '[data-testid="avatar-link"]', '[data-testid="actor-link"]', '[data-testid="issue-body-header-author"]', '[class*="AuthorLink-module"]', '[class*="ActivityHeader-module__AuthorName"]', 'a[data-hovercard-type="user"]', 'relative-time', '.commit-ref', '[class*="BranchName"]', '.IssueLabel', '.Label', '.topic-tag', '[class*="TopicTag"]', '.Counter', '#repository-details-container', '[data-testid="breadcrumbs"]', '#file-name-id-wide', '#file-name-id',
        // 仓库/星标/搜索列表的元信息行（语言·星标·证书·时间戳）——纯数据不进翻译单元，
        // 否则块级译文插进行内流会把整行撑散成逐项竖排；仓库名是标识符同样不译。
        '#user-repositories-list .f6', '#user-repositories-list h3', '#user-starred-repos .f6', '#user-starred-repos h3', '[data-testid="results-list"] .f6', '[data-testid="results-list"] h3', '.opened-by',
        // 工作流日志、blame、建议改动、反应计数、Copilot 面板：命令输出和元数据不进翻译单元。
        '.js-checks-log', '[data-testid="log-line"]', '.CheckRun-log-line', '.react-log-line', '.blame-hunk', '[data-testid="blame-hunk"]', '.js-suggested-changes-blob', '.js-comment-reactions-container', '.reaction-summary-item', '[data-testid="copilot-chat"]', '.copilot-chat-container'
      ],
      chrome: [
        '.AppHeader', '.UnderlineNav', '.tabnav', '#partial-discussion-sidebar', '#pr-conversation-sidebar', '.discussion-sidebar', '[data-testid="issue-viewer-metadata-pane"]', '.Layout-sidebar', '.BorderGrid', '[class*="SidebarSection-module"]', '[class*="SignedOutBanner"]', '.timeline-comment-header', '[class*="ActivityHeader-module"]', '.TimelineItem-body:not(:has(.comment-body))', '.TimelineBody:not(:has([class*="IssueCommentViewer"]))', '#wiki-rightbar', '.wiki-auxiliary-content'
      ]
    },
    {
      id: 'reddit',
      hosts: ['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com'],
      // 新版帖子页是 #main-content；旧版帖子加评论包在 div.content 里。侧栏在这两者之外。
      root: ['#main-content', 'div.content'],
      skip: [
        'shreddit-ad-post', 'shreddit-comments-page-ad', 'shreddit-sidebar-ad', '[data-promoted="true"]', '.promotedlink', 'faceplate-hovercard', 'faceplate-timeago', 'faceplate-number', 'shreddit-comment-action-row', 'shreddit-post-overflow-menu', 'shreddit-post-flair', '[slot="commentMeta"]', '[slot="credit-bar"]', '.tagline', '.flat-list.buttons', '.midcol', '.score',
        'shreddit-comment-author', 'shreddit-post-author', '[slot="commentAvatar"]', '[slot="vote-arrows"]', 'shreddit-award', 'award-button', 'a.author'
      ],
      chrome: [
        'reddit-header-large', 'reddit-header-small', 'shreddit-subreddit-header', '#left-sidebar-container', 'flex-left-nav-container', 'reddit-sidebar-nav', '#right-sidebar-container', '#header', '.side', '.footer-parent'
      ]
    },
    {
      id: 'hackernews',
      hosts: ['news.ycombinator.com'],
      root: ['#bigbox > td'],
      skip: ['.comhead', '.subtext', '.subline', '.rank', '.votelinks', '.navs', '.reply', '.togg', '.hnuser', '.age'],
      chrome: ['.pagetop', '.yclinks', '#hnmain > tbody > tr:first-child']
    },
    {
      id: 'stackexchange',
      hosts: ['stackoverflow.com', 'superuser.com', 'serverfault.com', 'askubuntu.com', 'mathoverflow.net', 'stackapps.com'],
      suffixes: ['stackexchange.com', 'stackoverflow.com'],
      root: ['#mainbar', '#content'],
      skip: [
        '.post-signature', '.user-info', '.s-user-card', '.js-vote-count', '.js-voting-container', '.votecell', '.post-taglist', '.js-post-tag-list-wrapper', '.js-post-menu', '.comment-user', '.comment-date', '.relativetime', '.relativetime-clean', '.comment-score', '.js-show-link', '.js-add-link', '.s-badge', '.inner-content > .d-flex.ai-center.fw-wrap'
      ],
      chrome: ['#left-sidebar', '#sidebar', '.s-topbar', '#footer', '.site-footer']
    },
    {
      id: 'discourse',
      hosts: ['meta.discourse.org'],
      generator: /^Discourse\b/i,
      skip: [
        '.topic-avatar', '.names', '.user-title', '.post-date', '.relative-date', '.post-controls', '.topic-map', '.post-links-container', '.badge-category__wrapper', '.discourse-tags', '.topic-timeline', '.timeline-container'
      ],
      chrome: [
        '.d-header', '#banner', '.skip-link', '.skip-links', '.more-topics__container', '#suggested-topics', '.topic-list', '.sidebar-wrapper', '.topic-footer-buttons'
      ]
    },
    {
      id: 'forem',
      hosts: ['dev.to'],
      skip: [
        '.crayons-article__header__meta p', '.crayons-tag', '.spec__tags', '.crayons-story__tags', '.crayons-story__meta', '.comment__header', '.crayons-avatar', '.crayons-bb', '.popover-billboard', '[data-display-unit]', '.reaction-button'
      ],
      chrome: [
        '#topbar', '.crayons-header', '.crayons-layout__sidebar-left', '.crayons-layout__sidebar-right', '.crayons-footer', '#footer-container'
      ]
    },
    {
      id: 'lobsters',
      hosts: ['lobste.rs'],
      skip: ['.byline', '.voters', '.tags'],
      chrome: ['header#nav', '#nav']
    },
    {
      id: 'gitlab',
      hosts: ['gitlab.com', 'docs.gitlab.com'],
      root: ['.issue-details', '.md-content'],
      skip: ['.diff-content', '.diff-file', '.line-numbers', '.line-content', '.commit-author-link', '.note-header', '.issuable-meta', '.labels', '.award', 'time'],
      chrome: ['.navbar-gitlab', '.nav-sidebar', '.super-sidebar', '.right-sidebar', '.layout-nav']
    },
    {
      id: 'npm',
      hosts: ['www.npmjs.com', 'npmjs.com'],
      root: ['#readme'],
      skip: ['.highlight', '.package-code'],
      chrome: ['#main-nav', '#package-sidebar']
    },
    {
      id: 'huggingface',
      hosts: ['huggingface.co'],
      root: ['.model-card-content'],
      skip: ['.code-sample', 'gradio-app', '.widget-box'],
      chrome: ['nav.main-nav', '.model-card-sidebar']
    },
    {
      id: 'arxiv',
      hosts: ['arxiv.org', 'ar5iv.labs.arxiv.org'],
      root: ['#abs', 'article.ltx_document', '.ltx_page_content'],
      skip: ['.ltx_equation', '.ltx_Math', '.authors', '.ar5iv-footer', '.dateline'],
      chrome: ['.ltx_page_header', '#header', '.extra-services']
    },
    {
      id: 'readthedocs',
      hosts: ['readthedocs.io'],
      suffixes: ['readthedocs.io'],
      root: ['.rst-content', '[itemprop="articleBody"]'],
      skip: ['.highlight', '.linenos'],
      chrome: ['.wy-nav-side', '.rst-versions', '.wy-side-nav-search']
    },
    {
      id: 'docsrs',
      hosts: ['docs.rs'],
      root: ['#main-content'],
      skip: ['.code-header', '.src-line-numbers'],
      chrome: ['nav.sidebar', '.sidebar']
    },
    {
      id: 'mdn',
      hosts: ['developer.mozilla.org'],
      root: ['#content', 'article'],
      skip: ['.interactive', '.play-sample', '.baseline-indicator'],
      chrome: ['#main-nav', '.top-navigation', '.article-actions', '.on-github']
    }
  ];
  // hostname 精确命中或 '.'+suffix 结尾命中；generator 为正则时测试 meta generator 字符串。
  function match({hostname, generator = ''} = {}) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!host && !generator) return null;
    for (const profile of PROFILES) {
      if ((profile.hosts || []).includes(host)) return profile;
      if ((profile.suffixes || []).some(suffix => host === suffix || host.endsWith('.' + suffix))) return profile;
      if (profile.generator && generator && profile.generator.test(generator)) return profile;
    }
    return null;
  }
  function selectors(input) {
    const profile = match(input);
    return {
      id: profile?.id || null,
      root: [...(profile?.root || [])],
      skip: [...GENERIC_SKIP, ...(profile?.skip || [])],
      chrome: [...(profile?.chrome || [])]
    };
  }
  globalThis.RoamCatSites = {PROFILES, GENERIC_SKIP, match, selectors};
})();

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
