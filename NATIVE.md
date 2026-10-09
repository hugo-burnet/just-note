# The Android reader

`src/main.ts` composes the app over `NativePlatform`, which reaches the sites with `CapacitorHttp`,
the phone's own network stack: no CORS to obey, any Referer to send. Only the hosts of the sites the
app reads may be asked for (`HostPolicy`, from the same list the sources come from; redirects checked
one by one), with size and type limits (`limits.ts`), and a refusal is a TransportError whose code the
screens have words for. Pictures are downloaded by the app (six at a time:
a chapter of two hundred pages is asked for as it nears the screen, not at once) and given
to `<img>` as `blob:` addresses; a picture that could not be had says why under its *Retry* button
("403 · host", `not_an_image`, `host_not_allowed`…). What is read is kept in the WebView's Cache API (`cacheNames.ts`), which *Settings → Data*
empties. *Settings → Diagnostic* is the Probe
workflow, from the phone: it fetches any https address (one per line, one report) with the
phone's own network, and through a WebView when an anti-bot check turns that away, and gives
a short report to copy: how the page describes itself, the kinds of page it links to with the
markup around the first link of the commonest kinds (and around a `blob:` picture, a canvas,
the synopsis), what it loads, what the page requested while it loaded, the pictures it names,
and the start of its body. After the WebView it asks once more with the phone's own network
and the cookie the WebView earned, and says how that was answered; it does the same for what the page
requested of its site's other hosts (the first bytes of each answer, the first picture with each thing a
server may want to see, and whether the picture's name is written in the page itself), which is what tells
whether a site can be read without running its scripts. A page the phone's own network reads
with no check is looked at the same way: the pictures it names (three, of the folder most of them are in,
which is a chapter's pages and not the site's logo) are asked for, with the variants, and with the
cookies the page set (their names are in the report, never their values).

The reader does the same when a site turns the phone away (`ChallengeGate`): the WebView
(`PageFetcherPlugin.java`) is shown in front of the app, so that a check which needs a tap
can be answered, and is given the very address that was refused. What it earns (the cookie,
and the User-Agent it is tied to) is kept per host and sent with the next requests, so the
phone's own network is used again and the WebView only comes back when the clearance runs out.
If the phone is still turned away with the cookie, a page is read from the WebView's copy;
pictures are not (they stay broken for a few minutes rather than open the WebView for each).
Requests turned away together share one WebView. A check that is not passed (cancelled, or
timed out) is the *human check* error.

A reader that builds its pictures with scripts (Scan-Manga's shows each as a `blob:` address)
is read in the same WebView, behind a spinner that says how far it has got (the page goes on behind it
as if it were seen, but a page scrolling by itself, advertisements and all, is nothing to look at; it is only
shown while the site's check is being passed, or when that is slow): the page is scrolled until the pictures its
selector matches have all come in (from one place the page keeps for a picture to the next when it has them,
which is quick however long the chapter is; a screen at a time otherwise), and their bytes are taken from the blobs the page made
(a script run before the page's own keeps them, as a page may let go of the address at once),
else asked for, else drawn. The plugin keeps them and the app takes them one at a time; they
are stored like any picture of the sites, under addresses of the site that never reach the
network, and the list of a chapter is stored too, so a chapter read once opens again without
the WebView, while the images remain in the cache. The compressed images of the current
and next captured chapter also stay in memory, so disk limits cannot break pages still
being read. A source asks for this with `transport.render(url, { pictures: selector, slots })`
(`slots` selects the places the page keeps for its pictures, there before the pictures are; those that
show are counted, a page may keep others hidden. The script waits for as many pictures as places, but for a
few seconds only when they stay fewer, as a page may number other things the same way; one that runs out of
time with fewer pictures than places fails, as the top of a chapter is not the chapter), which only the
app has.

A chapter link pasted from Scan-Manga does not name its series (its address has no room for the
series' number), so the reader asks the source to complete it (`Source.complete`): the page of
the chapter has a way back to its series. The addresses the app itself gives its chapters carry
the series after a `#`, which the site never sees.

The next chapter is read ahead: when the reader is 60 % through a chapter it asks for the next one with
`background`, which puts the WebView behind the app (it hides it; nothing shows, and a check that wants a
person is left alone) instead of the full-screen dialog, and what comes is kept like any other, so that the
chapter opens at once. What the user waits for (another chapter, say) stops a read ahead; a chapter asked
for while it is being read ahead is the same reading, not a second one.

Downloaded chapters (see the README) go in a cache of their own, `jr-saved`, in the WebView's Cache API,
under the address the app reads each picture by: `NativeImages` looks there before anything else, so a
downloaded chapter opens with no network and no WebView. The bytes are those the app reads (a picture
already kept while reading is copied, not asked for again); a Scan-Manga chapter is first read in the
WebView behind the app, as the next chapter is read ahead, and its captured pictures are copied in.
New chapters are looked for with every request marked `background`: `ChallengeGate` then uses a
clearance the WebView already holds, but never shows the WebView for it.

Not done yet: sharing a link to the app, and its own launcher icon.
