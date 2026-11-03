// Ariha Healthcare — renders the "Popular Articles" sidebar from
// assets/blog-posts.js, on blogs.html and on every article page.
//
// The markup in the page is kept as the fallback: if the data file is missing
// or empty, or nothing is left to show, whatever was authored by hand stays
// on screen rather than the sidebar emptying itself.
(function () {
  var MAX_ITEMS = 3;

  // Compare pages by filename. The site is flat (every blog page sits at the
  // root), and this also survives the trailing-slash and .html-less forms a
  // static host may serve the same page under.
  function fileOf(path) {
    var clean = String(path).split('#')[0].split('?')[0];
    var last = clean.substring(clean.lastIndexOf('/') + 1);
    return (last || 'index.html').toLowerCase().replace(/\.html$/, '');
  }

  function buildItem(post) {
    var link = document.createElement('a');
    link.className = 'popular-item';
    link.href = post.href;

    var imageWrap = document.createElement('div');
    imageWrap.className = 'article-image';

    var img = document.createElement('img');
    img.className = 'image-31';
    img.src = post.image;
    img.loading = 'lazy';
    // The link text already names the article, so the thumbnail is
    // decorative - an alt repeating the title would be read out twice.
    img.alt = '';
    imageWrap.appendChild(img);

    var meta = document.createElement('div');
    meta.className = 'article-meta';

    var title = document.createElement('div');
    title.className = 'text-block-32';
    title.textContent = post.title;

    var sub = document.createElement('div');
    sub.className = 'text-block-33';
    sub.textContent = post.readTime ? post.date + ' - ' + post.readTime : post.date;

    meta.appendChild(title);
    meta.appendChild(sub);

    link.appendChild(imageWrap);
    link.appendChild(meta);
    return link;
  }

  function render(list, posts, here) {
    var frag = document.createDocumentFragment();
    var shown = 0;

    for (var i = 0; i < posts.length && shown < MAX_ITEMS; i++) {
      var post = posts[i];
      if (!post || !post.href || !post.title) continue;
      // Never offer the page the reader is already on.
      if (fileOf(post.href) === here) continue;
      frag.appendChild(buildItem(post));
      shown++;
    }

    if (!shown) return;
    list.textContent = '';
    list.appendChild(frag);
  }

  function start() {
    var posts = window.ARIHA_BLOG_POSTS;
    if (!posts || !posts.length) return;

    var lists = document.querySelectorAll('.popular-list');
    var here = fileOf(window.location.pathname);
    for (var i = 0; i < lists.length; i++) render(lists[i], posts, here);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
