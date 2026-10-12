import { useEffect, useMemo, useRef, useState } from 'react';

// A tag-filtered list of films, shows, games, books and albums, grouped by
// artist. Albums open a Bandcamp player; everything else shows the intro of
// its Wikipedia article. Ported from the CodePen "Media List in Vue".

// [name, artist, release, embed type, url, tags, bandcamp album id?]
const RAW = [
  ["The Fountain", "Darren Aronofsky", "2006", "wikipedia", "https://en.wikipedia.org/wiki/The_Fountain", ["film"]],
  ["Princess Mononoke", "Hayao Miyazaki", "1997", "wikipedia", "https://en.wikipedia.org/wiki/Princess_Mononoke", ["film", "anime"]],
  ["Ghost in the Shell", "Mamoru Oshii", "1996", "wikipedia", "https://en.wikipedia.org/wiki/Ghost_in_the_Shell_(1995_film)", ["film", "anime"]],
  ["Serial Experiments Lain", "Triangle Staff", "1998", "wikipedia", "https://en.wikipedia.org/wiki/Serial_Experiments_Lain", ["tv", "anime", "nostalgia"]],
  ["Fullmetal Alchemist: Brotherhood", "Bones", "2009", "wikipedia", "https://en.wikipedia.org/wiki/Fullmetal_Alchemist:_Brotherhood", ["tv", "anime", "nostalgia"]],
  ["Outlaw Star", "Sunrise", "1998", "wikipedia", "https://en.wikipedia.org/wiki/Outlaw_Star#Anime", ["tv", "anime", "nostalgia"]],
  ["Cowboy Bebop", "Sunrise", "1997", "wikipedia", "https://en.wikipedia.org/wiki/Cowboy_Bebop", ["tv", "anime", "nostalgia"]],
  ["Samurai Champloo", "Manglobe", "2004", "wikipedia", "https://en.wikipedia.org/wiki/Samurai_Champloo", ["tv", "anime", "nostalgia"]],
  ["Dragon Ball Z", "Toei Animation", "1989", "wikipedia", "https://en.wikipedia.org/wiki/Dragon_Ball_Z", ["tv", "anime", "nostalgia"]],
  ["Neon Genesis Evangelion", "Gainax and Tatsunoko Production", "1995", "wikipedia", "https://en.wikipedia.org/wiki/Neon_Genesis_Evangelion", ["tv", "anime", "nostalgia"]],
  ["Trigun", "Yasuhiro Nightow, Madhouse", "1998", "wikipedia", "https://en.wikipedia.org/wiki/Trigun#Anime", ["anime", "nostalgia"]],
  ["Blue Gender", "Masashi Abe and Ryōsuke Takahashi", "1999", "wikipedia", "https://en.wikipedia.org/wiki/Blue_Gender", ["anime", "nostalgia"]],
  ["Sonic 3 & Knuckles", "Sega", "1994", "wikipedia", "https://en.wikipedia.org/wiki/Sonic_the_Hedgehog_3#Sonic_the_Hedgehog_3_&_Knuckles", ["game", "nostalgia"]],
  ["Zone of the Enders", "Konami", "2001", "wikipedia", "https://en.wikipedia.org/wiki/Zone_of_the_Enders_(video_game)", ["game", "nostalgia"]],
  ["Halo: Combat Evolved", "Bungie", "2003", "wikipedia", "https://en.wikipedia.org/wiki/Halo:_Combat_Evolved", ["game", "pc"]],
  ["Devil May Cry", "Capcom", "2001", "wikipedia", "https://en.wikipedia.org/wiki/Devil_May_Cry", ["game", "ps2"]],
  ["ICO", "Team Ico", "2001", "wikipedia", "https://en.wikipedia.org/wiki/Ico", ["game", "ps2"]],
  ["Shadow of the Colossus", "Team Ico", "2001", "wikipedia", "https://en.wikipedia.org/wiki/Shadow_of_the_Colossus", ["game", "ps2"]],
  ["Journey", "Thatgamecompany", "2012", "wikipedia", "https://en.wikipedia.org/wiki/Journey_(2012_video_game)", ["game", "ps3"]],
  ["Dark Souls III", "FromSoftware", "2016", "wikipedia", "https://www.bandainamcoent.com/games/dark-souls-iii", ["game", "pc"]],
  ["Fez", "Polytron Corporation", "2013", "wikipedia", "http://fezgame.com/", ["game"]],
  ["Hyper Light Drifter", "Heart Machine", "2016", "wikipedia", "http://www.heart-machine.com/", ["game"]],
  ["Celeste", "Matt Makes Games", "2018", "wikipedia", "http://www.celestegame.com/", ["game"]],
  ["Kirby & the Amazing Mirror", "HAL Laboratory", "2004", "wikipedia", "https://en.wikipedia.org/wiki/Kirby_%26_the_Amazing_Mirror", ["game", "gba", "nostalgia"]],
  ["The Legend of Zelda: The Minish Cap", "Capcom", "2005", "wikipedia", "https://en.wikipedia.org/wiki/The_Legend_of_Zelda:_The_Minish_Cap", ["game", "gba", "nostalgia"]],
  ["Spyro the Dragon", "Insomniac Games", "1998", "wikipedia", "https://en.wikipedia.org/wiki/Spyro_the_Dragon", ["game", "psx", "nostalgia"]],
  ["Spyro 2: Ripto's Rage!", "Insomniac Games", "1999", "wikipedia", "https://en.wikipedia.org/wiki/Spyro_2:_Ripto%27s_Rage!", ["game", "psx", "nostalgia"]],
  ["Spyro: Year of the Dragon", "Insomniac Games", "2000", "wikipedia", "https://en.wikipedia.org/wiki/Spyro:_Year_of_the_Dragon", ["game", "psx", "nostalgia"]],
  ["Mega Man Legends 2", "Capcom", "2000", "wikipedia", "https://en.wikipedia.org/wiki/Mega_Man_Legends_2", ["game", "psx", "nostalgia"]],
  ["Ape Escape", "SCE Japan Studio", "2005", "wikipedia", "https://en.wikipedia.org/wiki/Ape_Escape_(video_game)", ["game", "psx", "nostalgia"]],
  ["Guild Wars", "ArenaNet", "2005", "wikipedia", "https://www.guildwars.com/en/", ["game", "pc", "nostalgia"]],
  ["Armored Core: For Answer", "FromSoftware", "2008", "wikipedia", "https://en.wikipedia.org/wiki/Armored_Core:_For_Answer", ["game"]],
  ["The Hero with a Thousand Faces", "Joseph Campbell", "1949", "wikipedia", "https://en.wikipedia.org/wiki/The_Hero_with_a_Thousand_Faces", ["book"]],
  ["A Brief History of Time", "Stephen Hawking", "1988", "wikipedia", "https://en.wikipedia.org/wiki/A_Brief_History_of_Time", ["book", "science"]],
  ["Unweaving the Rainbow", "Richard Dawkins", "1998", "wikipedia", "https://en.wikipedia.org/wiki/Unweaving_the_Rainbow", ["book", "science"]],
  ["The Consolation of Philosophy", "Boethius", "524", "wikipedia", "https://en.wikipedia.org/wiki/The_Consolation_of_Philosophy", ["book", "philosophy", "poetry"]],
  ["Beowulf", "Unknown", "975", "wikipedia", "https://en.wikipedia.org/wiki/Beowulf", ["book", "poetry"]],
  ["The Prose Edda", "Snorri Sturluson", "1220", "wikipedia", "https://en.wikipedia.org/wiki/Prose_Edda", ["book", "poetry"]],
  ["The Divine Comedy", "Dante Alighieri", "1320", "wikipedia", "https://en.wikipedia.org/wiki/Divine_Comedy", ["book", "poetry"]],
  ["Soundtrack to a Vacant Life", "The Flashbulb", "2008", "bandcamp", "https://theflashbulb.bandcamp.com/album/soundtrack-to-a-vacant-life", ["music", "electronica"], "4198308764"],
  ["Dive", "Tycho", "2015", "bandcamp", "https://tycho.bandcamp.com/album/dive", ["music", "electronica"], "3619628392"],
  ["FEZ OST", "Disasterpeace", "2012", "bandcamp", "https://music.disasterpeace.com/album/fez-ost", ["music", "electronica"], "688853505"],
  ["Hyper Light Drifter OST", "Disasterpeace", "2016", "bandcamp", "https://music.disasterpeace.com/album/hyper-light-drifter", ["music", "electronica"], "2303268128"],
  ["To Live", "bvdub", "2009", "bandcamp", "https://bvdub.bandcamp.com/album/to-live", ["music", "electronica"], "2306392998"],
  ["We Were the Sun", "bvdub", "2009", "bandcamp", "https://bvdub.bandcamp.com/album/we-were-the-sun", ["music", "electronica"], "4266696895"],
  ["The Art of Dying Alone", "bvdub", "2010", "bandcamp", "https://bvdub.bandcamp.com/album/the-art-of-dying-alone", ["music", "electronica"], "4075803671"],
  ["I Remember (Translations of Mørketid)", "bvdub", "2011", "bandcamp", "https://bvdub.bandcamp.com/album/i-remember-translations-of-m-rketid", ["music", "electronica"], "1479213977"],
  ["One Last Look at the Sea", "bvdub", "2011", "bandcamp", "https://bvdub.bandcamp.com/album/one-last-look-at-the-sea", ["music", "electronica"], "547930773"],
  ["Resistance is Beautiful", "bvdub", "2011", "bandcamp", "https://bvdubdarla.bandcamp.com/album/resistance-is-beautiful", ["music", "electronica"], "3834218025"],
  ["Songs For a Friend I Left Behind", "bvdub", "2011", "bandcamp", "https://bvdub.bandcamp.com/album/songs-for-a-friend-i-left-behind", ["music", "electronica"], "726201853"],
  ["The Truth Hurts", "bvdub & Ian Hawgood", "2011", "bandcamp", "https://bvdub.bandcamp.com/album/bvdub-ian-hawgood-the-truth-hurts", ["music", "electronica"], "1103152910"],
  ["Then", "bvdub", "2011", "bandcamp", "https://bvdub.bandcamp.com/album/then", ["music", "electronica"], "485530863"],
  ["Tribes at the Temple of Silence", "bvdub | Brock Van Wey", "2011", "bandcamp", "https://bvdub.bandcamp.com/album/tribes-at-the-temple-of-silence", ["music", "electronica"], "32579493"],
  ["All is Forgiven", "bvdub | Brock Van Wey", "2012", "bandcamp", "https://bvdub.bandcamp.com/album/all-is-forgiven", ["music", "electronica"], "2717876220"],
  ["Serenity", "bvdub", "2012", "bandcamp", "https://darlamusic.bandcamp.com/album/serenity", ["music", "electronica"], "2966618244"],
  ["The First Day", "bvdub", "2012", "bandcamp", "https://bvdub.bandcamp.com/album/the-first-day", ["music", "electronica"], "3780479369"],
  ["A Careful Ecstacy", "bvdub", "2013", "bandcamp", "https://bvdubdarla.bandcamp.com/album/a-careful-ecstasy", ["music", "electronica"], "1214424874"],
  ["Erebus", "bvdub & Loscil", "2013", "bandcamp", "https://glacialmovements.bandcamp.com/album/erebus", ["music", "electronica"], "481442721"],
  ["I'll Only Break Your Heart", "bvdub", "2014", "bandcamp", "https://bvdubdarla.bandcamp.com/album/ill-only-break-your-heart", ["music", "electronica"], "2055577654"],
  ["Home", "bvdub", "2015", "bandcamp", "https://bvdub.bandcamp.com/album/brock-van-wey-home", ["music", "electronica"], "200675916"],
  ["Selected Ambient Works", "Aphex Twin", "1992", "bandcamp", "https://apollorecords.bandcamp.com/album/selected-ambient-works-85-92", ["music", "electronica"], "1881652386"],
  ["Hail Wind and Hewn Oak", "Falls of Rauros", "2008", "bandcamp", "https://fallsofrauros.bandcamp.com/album/hail-wind-and-hewn-oak-2015-remaster", ["music", "metal"], "3214186951"],
  ["The Light That Dwells in Rotten Wood", "Falls of Rauros", "2013", "bandcamp", "https://fallsofrauros.bandcamp.com/album/the-light-that-dwells-in-rotten-wood-2013-remaster", ["music", "metal"], "1602169422"],
  ["Empires of Ash", "Sojourner", "2016", "bandcamp", "https://sojournermetal.bandcamp.com/album/empires-of-ash", ["music", "metal"], "237208640"],
  ["Mammal", "Altar of Plagues", "2011", "", "https://www.metal-archives.com/albums/Altar_of_Plagues/Mammal/299885", ["music", "metal"]],
  ["White Tomb", "Altar of Plagues", "2009", "", "https://www.metal-archives.com/albums/Altar_of_Plagues/White_Tomb/225046", ["music", "metal"]],
  ["Of Dirt", "Woman is the Earth", "2009", "", "https://www.metal-archives.com/albums/Woman_Is_the_Earth/Of_Dirt/339409", ["music", "metal"]],
  ["This Place That Contains My Spirit", "Woman is the Earth", "2011", "bandcamp", "https://womanistheearth.bandcamp.com/album/this-place-that-contains-my-spirit", ["music", "metal"], "469308340"],
  ["Two Hunters", "Wolves in the Throne Room", "2007", "bandcamp", "https://wolvesinthethroneroom.bandcamp.com/album/two-hunters", ["music", "metal"], "2456241413"],
  ["Celestial Lineage", "Wolves in the Throne Room", "2011", "bandcamp", "https://wolvesinthethroneroom.bandcamp.com/album/celestial-lineage", ["music", "metal"], "734137787"],
  ["In Turmoil", "ANCST", "2014", "bandcamp", "https://angstnoise.bandcamp.com/album/in-turmoil", ["music", "metal"], "3589489578"],
  ["The Gathering Wilderness", "Primordial", "2005", "bandcamp", "https://primordialofficial.bandcamp.com/album/the-gathering-wilderness", ["music", "metal"], "419868551"],
  ["Sunbather", "Deafheaven", "2013", "bandcamp", "https://deafheavens.bandcamp.com/album/sunbather", ["music", "metal"], "4022394178"],
  ["Roads to the North", "Panopticon", "2014", "bandcamp", "https://thetruepanopticon.bandcamp.com/album/roads-to-the-north", ["music", "metal"], "3456041268"],
  ["Kentucky", "Panopticon", "2012", "bandcamp", "https://thetruepanopticon.bandcamp.com/album/kentucky", ["music", "metal"], "2235870668"],
];

const INSPIRATIONS = RAW.map(([name, artist, release, embedType, url, tags, bandcampId]) => ({
  name, artist, release, embedType, url, tags, bandcampId,
}));

const TAG_GROUPS = [
  ['music', 'electronica', 'metal'],
  ['game', 'gba', 'psx', 'ps2', 'ps3', 'pc'],
  ['book', 'science', 'philosophy', 'poetry'],
  ['film', 'tv', 'anime'],
];

// Every tag, in order of first appearance.
const ALL_TAG_NAMES = [...new Set(INSPIRATIONS.flatMap((i) => i.tags))];

// Side-by-side list and panel once the component is at least this wide.
const WIDE = 672;

const ACCENT = '#DB2D6C';

function byCountThenName(a, b) {
  if (a.count !== b.count) return b.count - a.count;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function byArtistThenRelease(a, b) {
  const x = a.artist.toLowerCase();
  const y = b.artist.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a.release < b.release ? -1 : a.release > b.release ? 1 : 0;
}

// Items whose name alone would land on the wrong Wikipedia article.
const WIKI_TITLE_OVERRIDES = {
  Fez: 'Fez (video game)',
  Celeste: 'Celeste (video game)',
};

// The article to summarise: the title in a Wikipedia URL, else the item's name.
function wikipediaTitle(item) {
  if (WIKI_TITLE_OVERRIDES[item.name]) return WIKI_TITLE_OVERRIDES[item.name];
  const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/.exec(item.url);
  if (m) {
    try {
      return decodeURIComponent(m[1]).replace(/_/g, ' ');
    } catch {
      return m[1].replace(/_/g, ' ');
    }
  }
  return item.name;
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function useWikipediaSummary(item) {
  const [state, setState] = useState({ status: 'idle', text: '' });
  useEffect(() => {
    if (!item || item.embedType !== 'wikipedia') {
      setState({ status: 'idle', text: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'loading', text: '' });
    const url =
      'https://en.wikipedia.org/w/api.php?origin=*&format=json&action=query' +
      '&prop=extracts&exintro&explaintext&redirects=1&titles=' +
      encodeURIComponent(wikipediaTitle(item));
    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const pages = data?.query?.pages ?? {};
        const page = pages[Object.keys(pages)[0]];
        if (!page || page.missing !== undefined || !page.extract) {
          setState({ status: 'error', text: 'No Wikipedia summary found for this one.' });
        } else {
          setState({ status: 'ok', text: page.extract });
        }
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setState({ status: 'error', text: 'Could not load the Wikipedia summary.' });
      });
    return () => controller.abort();
  }, [item]);
  return state;
}

const tagBase =
  'inline-flex h-9 items-center px-4 text-sm font-medium uppercase tracking-wider ' +
  'transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2';

function TagButton({ tag, selected, position, onClick }) {
  // position: '' | 'left' | 'center' | 'right' — joined buttons of one tag group
  const joined = {
    '': 'mr-2.5 border',
    left: 'border border-r-0',
    center: 'border border-x-0',
    right: 'mr-2.5 border border-l-0',
  }[position];
  const divider = position === 'center' || position === 'right';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${tagBase} ${joined} ${
        selected ? 'text-white' : 'hover:bg-[#DB2D6C]/15'
      }`}
      style={{
        borderColor: ACCENT,
        background: selected ? ACCENT : undefined,
        color: selected ? '#fff' : ACCENT,
        boxShadow: divider ? `inset 1px 0 0 rgba(219,45,108,0.3)` : undefined,
        outlineColor: ACCENT,
      }}
    >
      {tag.name}
      <sup className="ml-0.5 text-[0.65rem]">{tag.count}</sup>
    </button>
  );
}

function Panel({ item, summary }) {
  if (!item) return null;
  if (item.embedType === 'bandcamp') {
    return (
      <iframe
        title={`${item.name} by ${item.artist} on Bandcamp`}
        className="block w-full max-w-[350px] border-0"
        style={{ height: 786 }}
        src={`https://bandcamp.com/EmbeddedPlayer/album=${item.bandcampId}/size=large/bgcol=333333/linkcol=ffffff/transparent=true/`}
        seamless
      >
        <a href={item.url}>⤤</a>
      </iframe>
    );
  }
  if (item.embedType === 'wikipedia') {
    return (
      <div className="rounded border border-gray-800 bg-gray-900 p-4 text-sm leading-relaxed text-gray-300">
        {summary.status === 'loading' && <p className="text-gray-500">Loading summary…</p>}
        {summary.status === 'error' && <p className="text-gray-400">{summary.text}</p>}
        {summary.status === 'ok' && <p className="whitespace-pre-line">{summary.text}</p>}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block hover:opacity-80"
          style={{ color: ACCENT }}
        >
          More ⤤
        </a>
      </div>
    );
  }
  return null;
}

export default function MediaList() {
  const rootRef = useRef(null);
  const width = useWidth(rootRef);
  const wide = width >= WIDE;

  // Selected tags keep the count they showed when they were picked.
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedName, setSelectedName] = useState(null);

  const selectedItem = useMemo(
    () => INSPIRATIONS.find((i) => i.name === selectedName) ?? null,
    [selectedName],
  );
  const summary = useWikipediaSummary(selectedItem);

  const filtered = useMemo(() => {
    let r = INSPIRATIONS;
    for (const t of selectedTags) r = r.filter((i) => i.tags.includes(t.name));
    return [...r].sort(byArtistThenRelease);
  }, [selectedTags]);

  // Items with an artist heading row before each run of the same artist.
  const rows = useMemo(() => {
    const out = [];
    let prev = null;
    for (const item of filtered) {
      if (item.artist !== prev) {
        out.push({ isArtist: true, key: `artist:${item.artist}`, artist: item.artist });
        prev = item.artist;
      }
      out.push({ isArtist: false, key: item.name, item });
    }
    return out;
  }, [filtered]);

  // Remaining tags on the filtered items, counted over them, most common first;
  // tags from each tag group are then pulled to the front and joined together.
  const tagButtons = useMemo(() => {
    const picked = new Set(selectedTags.map((t) => t.name));
    let tags = ALL_TAG_NAMES.filter((n) => !picked.has(n))
      .map((name) => ({ name, count: filtered.filter((i) => i.tags.includes(name)).length }))
      .filter((t) => t.count > 0)
      .sort(byCountThenName);

    const grouped = [];
    for (const group of TAG_GROUPS) {
      const members = group
        .map((name) => tags.find((t) => t.name === name))
        .filter(Boolean);
      tags = tags.filter((t) => !group.includes(t.name));
      members.forEach((t, j) => {
        let position = '';
        if (members.length > 1) {
          position = j === 0 ? 'left' : j === members.length - 1 ? 'right' : 'center';
        }
        grouped.push({ ...t, position });
      });
    }
    return grouped.concat(tags.map((t) => ({ ...t, position: '' })));
  }, [filtered, selectedTags]);

  const pickTag = (tag) => setSelectedTags((s) => [...s, { name: tag.name, count: tag.count }]);
  const unpickTag = (tag) => setSelectedTags((s) => s.filter((t) => t.name !== tag.name));
  const toggleItem = (item) => setSelectedName((n) => (n === item.name ? null : item.name));

  const panel = <Panel item={selectedItem} summary={summary} />;

  return (
    <div ref={rootRef} className="w-full text-white">
      <div className="mt-2 flex flex-wrap items-center justify-center gap-y-2.5">
        {selectedTags.map((tag) => (
          <TagButton key={`sel:${tag.name}`} tag={tag} selected position="" onClick={() => unpickTag(tag)} />
        ))}
        {tagButtons.map((tag) => (
          <TagButton key={tag.name} tag={tag} position={tag.position} onClick={() => pickTag(tag)} />
        ))}
        <button
          type="button"
          aria-label="Clear selected tags"
          title="Clear selected tags"
          onClick={() => setSelectedTags([])}
          disabled={selectedTags.length === 0}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-200 enabled:cursor-pointer disabled:opacity-60"
          style={{
            borderColor: ACCENT,
            background: selectedTags.length ? ACCENT : 'transparent',
            color: selectedTags.length ? '#fff' : ACCENT,
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>

      <div className={`mt-8 flex gap-8 ${wide ? 'flex-row items-start' : 'flex-col'}`}>
        <ul className="min-w-0 flex-1">
          {rows.map((row) => {
            if (row.isArtist) {
              return (
                <li key={row.key} className="mt-5 text-xl text-white/80 first:mt-0">
                  {row.artist}
                </li>
              );
            }
            const { item } = row;
            const isSelected = item === selectedItem;
            return (
              <li
                key={row.key}
                className={`transition-[margin] duration-300 ${isSelected ? 'my-5' : ''}`}
              >
                <div className="flex items-baseline">
                  <span className="w-[46px] shrink-0 text-white/80">{item.release}</span>
                  {item.embedType ? (
                    <button
                      type="button"
                      aria-expanded={isSelected}
                      onClick={() => toggleItem(item)}
                      className={`cursor-pointer text-left transition-[font-size,opacity] duration-200 hover:opacity-80 ${
                        isSelected ? 'text-2xl' : ''
                      }`}
                      style={{ color: ACCENT }}
                    >
                      {item.name}
                    </button>
                  ) : (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:opacity-80"
                      style={{ color: ACCENT }}
                    >
                      {item.name}
                      <span className="ml-2.5 opacity-20">⤤</span>
                    </a>
                  )}
                </div>
                {!wide && isSelected && <div className="mt-3">{panel}</div>}
              </li>
            );
          })}
        </ul>
        {wide && selectedItem && (
          <div className="sticky top-4 w-[350px] shrink-0">{panel}</div>
        )}
      </div>
    </div>
  );
}
