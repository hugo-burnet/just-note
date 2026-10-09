# The library

What the shelf does besides keeping your place: it says what is new, it filters by genre,
and it keeps chapters on the device for a journey with no network.

**New chapters.** When the library opens (and when the app comes back to the front), each
series not read from its site for 30 minutes is read again, two at a time (`UpdateChecker`).
A cover then says how many chapters came out since the series was last opened (*2 new*);
opening it clears that. These checks never show an anti-bot check: they go through the same
sources with every request marked `background` (`inBackground`), and a site that asks for a
human check is simply tried again next time.

**Filter the shelf by genre.** Above the shelf, the genres of its series, the commonest first: a
tap keeps a genre (only the series that have it; several kept genres must all be there), a second
leaves it out (the series that have it are hidden), a third lets it go. The choice is remembered
(`GenreFilter`). Two spellings of one genre (*Sci-Fi*, *sci fi*) are one. A series keeps the genres
its page gave it; one kept before that is read again when the library opens.

**Downloads, to read with no network.** In a series, the ⤓ button beside *Continue* downloads
the next 5 or 10 unread chapters, or all of them, from where you are; each chapter also has its
own button, which shows a ring while it comes in and turns into a mark once kept. A chapter is
kept whole or not at all (its list of pictures, every picture, and the page of its series, so
that the series opens offline too), one chapter at a time (`Downloads`). It goes in a cache of
its own (`jr-saved`, `CacheShelf`), which the reading budgets below never trim and *Clear the
reading cache* does not touch: it stays until you remove it (in the series, or *Settings → Data*).
The browser is asked to keep that storage (`navigator.storage.persist`). A downloaded chapter is
read from the device even online. Keep the app open while it downloads.
