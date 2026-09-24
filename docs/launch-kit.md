# Launch kit

Copy for posting FindTool to developer communities. Every claim here was
verified against the live site — don't soften them into marketing language,
and don't strengthen them either. The specificity is what makes it credible
to this audience.

---

## Hacker News

**Submit (opens the form pre-filled):**
https://news.ycombinator.com/submitlink?u=https%3A%2F%2Ffindtool.dev&t=Show%20HN%3A%20FindTool%20%E2%80%93%2050%20developer%20tools%20that%20run%20entirely%20in%20your%20browser

**Title:**
```
Show HN: FindTool – 50 developer tools that run entirely in your browser
```

**Post this as the first comment, immediately after submitting.** It matters
more than the title — it's what people read before deciding to click.

```
I kept pasting API responses and JWTs into random online formatters, then
realising I'd just sent production data to a server I know nothing about. So I
built the version I wanted: every tool is client-side, there is no backend to
send anything to, and you can verify that in the network tab or by turning off
your wifi after the page loads.

50 tools — JSON, encoding, hashing, dates, text, regex. A few details that
might interest people here:

- No UI framework. The homepage is 6.2 KB over the wire; tool pages are
  10–15 KB including their JavaScript.
- The regex tester runs patterns in a Web Worker with a hard timeout, so a
  catastrophically backtracking expression can't freeze the tab. That failure
  mode still exists on a lot of online testers.
- JWT signature verification is real Web Crypto against a key you supply, not
  a "looks about right" check. With no key it says the signature was not
  verified and implies nothing else.
- MD5 and SHA-1 are present for legacy compatibility and labelled as broken,
  not offered as security. SHA-256 says explicitly that it is not a password
  hashing function.
- Everything renders server-side, so the content works with JavaScript
  disabled — only the interactivity needs it.

Happy to hear what's wrong with it.
```

**Timing:** weekday, roughly 08:00–10:00 US Eastern. Avoid weekends.

**If it doesn't appear on /show:** new accounts are sometimes filtered. Email
hn@ycombinator.com and ask them to look — they usually surface it.

**Someone will ask if it was AI-built.** Decide your answer before you post.
Being upfront consistently lands better than being caught out.

---

## Reddit

Check each subreddit's self-promotion rules first — several require the post
to be in a weekly thread, and some have account-age gates.

**r/SideProject** (friendliest, no karma gate)
https://www.reddit.com/r/SideProject/submit?url=https%3A%2F%2Ffindtool.dev&title=FindTool%20%E2%80%93%2050%20developer%20tools%20that%20run%20entirely%20in%20your%20browser%2C%20no%20backend

**r/webdev** (often has a Showoff Saturday thread)
https://www.reddit.com/r/webdev/submit?url=https%3A%2F%2Ffindtool.dev&title=I%20built%2050%20developer%20tools%20with%20no%20backend%20%E2%80%93%20nothing%20you%20paste%20ever%20leaves%20your%20browser

**r/InternetIsBeautiful** (large, good fit for tool sites)
https://www.reddit.com/r/InternetIsBeautiful/submit?url=https%3A%2F%2Ffindtool.dev&title=A%20collection%20of%2050%20developer%20tools%20that%20work%20entirely%20offline%20in%20your%20browser

**r/javascript** (the no-framework angle plays well)
https://www.reddit.com/r/javascript/submit?url=https%3A%2F%2Ffindtool.dev&title=50%20developer%20tools%2C%20no%20UI%20framework%20%E2%80%93%206.2%20KB%20homepage%2C%20tool%20pages%2010%E2%80%9315%20KB

**Skip r/programming.** It's hostile to self-promotion; you'd only get
downvoted, and that follows the domain around.

**Reddit body text** (same for most subs):

```
Every tool runs as JavaScript in your own tab. There's no backend, so the JSON
you format, the token you decode and the password you generate are never sent
anywhere — you can check in the network tab, or disconnect after the page
loads and keep using it.

The bits I'd want to know about if someone showed me this:

- No UI framework, so the homepage is 6.2 KB over the wire.
- Regex patterns run in a Web Worker with a 1.5s timeout, so catastrophic
  backtracking can't lock up the tab.
- JWT signature verification is real, using Web Crypto against a key you
  paste. No key, no claim of validity.
- MD5 and SHA-1 are marked as broken rather than offered as security.
- No cookies, no signup, no rate limits.

Free, and I'd rather hear what's broken than what's good.
```

---

## dev.to

The durable one — a permanent indexed backlink that keeps working long after
an HN thread scrolls off. Post at https://dev.to/new

**Title:** `Your online JSON formatter might be logging your API keys`

**Tags:** `webdev`, `javascript`, `security`, `showdev`

**Body:** see `docs/launch-post-devto.md`

---

## What actually determines whether this works

**Answer comments for the first two to three hours.** A post with an engaged
author reliably outperforms a better project posted and abandoned.

Expect blunt criticism — that's the format, not hostility. The useful feedback
is usually in the harshest comments.

**Realistic outcome:** most Show HN posts get 5–50 points and a few hundred
visitors. That is still worth doing: the backlinks are what a new domain needs,
and a handful of people will bookmark it. Front page is upside, not the plan.

**The site will survive a spike.** Static files on Cloudflare's CDN, no
backend, no database, no rate limits. A traffic surge costs nothing and cannot
take it down.
