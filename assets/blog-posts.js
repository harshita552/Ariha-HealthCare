// Ariha Healthcare — the blog index, kept in one place.
//
// The "Popular Articles" sidebar used to be hand-written four times: once on
// blogs.html and once inside every article page. Adding a post meant editing
// all four copies and they drifted apart. assets/popular-articles.js now
// renders that sidebar from this list, so a new post is one entry here.
//
// Order is the sidebar order. The sidebar shows the first three entries that
// are not the article currently being read, so move a post up to promote it.
//
// Each entry:
//   href     - page to link to, relative to the site root
//   title    - shown as the item text (plain text, write apostrophes normally)
//   image    - thumbnail, relative to the site root (spaces are fine)
//   date     - as it should read, e.g. "May 12, 2025"
//   readTime - e.g. "5 min"; omit it and only the date is shown
window.ARIHA_BLOG_POSTS = [
  {
    href: 'second-trimester-what-to-expect.html',
    title: 'Your Second Trimester: What to Expect and How to Prepare',
    image: 'assets/6a364d2ee0b618c77b08bd89/6a5a117ee070577d3cce992b_Rectangle 4812481 (1).png',
    date: 'May 12, 2025',
    readTime: '5 min'
  },
  {
    href: 'puberty-in-girls-whats-normal.html',
    title: 'Puberty in Girls: What’s Normal and When Should Parents Seek Advice?',
    image: 'assets/6a364d2ee0b618c77b08bd89/Blog-listing-2.png',
    date: 'May 12, 2025',
    readTime: '5 min'
  },
  {
    href: 'vaginal-delivery-or-c-section.html',
    title: 'Vaginal Delivery or C-Section? 3 Ways We Help You Choose',
    image: 'assets/6a364d2ee0b618c77b08bd89/Blog-listing-3.png',
    date: 'May 12, 2025',
    readTime: '5 min'
  }
];
