import json, pathlib

JSON_PATH = pathlib.Path(r"C:\Users\snowb\Programs\mcdev\mcdev\src\programs\woodlandfortress\bandcamp_data.json")

# All album IDs collected from scraper runs
IDS = {
    "hole-dweller": {
        "flies the coop": "3942234626",
        "flies the coop II": "3069687900",
        "flies the coop III": "1274138815",
        "Crossroads": "2091304632",
        "another chance at peace": "2936647780",
        "With Dreams of Hereafter": "1620656061",
        "Returns to Roost": "2989657906",
        "Endless Night": "51460799",
        "Hole in One": "3157837652",
        "Hollowed Out (feat. Barre Gambling)": "1585091174",
        "the first of yule [demo]": "662928034",
        "Winterlude [single]": "3262189254",
        "The Elven Door [single]": "1310795844",
        "Wolves in the Hen House [EP]": "967709957",
    },
    "malfet": {
        "Dolorous Gard": "1072151547",
        "Alban Arthan": "665603629",
        "The Glimmering": "288325961",
        "The Way To Avalon": "961670542",
        "The Snaking Path": "4045728393",
    },
    "hermit-knight": {
        "once": "2555699484",
        "of frost and woe": "1856273980",
        "wandeweorpe": "2793370122",
        "pseudanthium": "4102977805",
        "adventures in depersonalization": "318911255",
        "Upon The Dawn of the Vermilion Glaive": "4073647435",
        "the translucent obelisk": "2988169925",
        "raise your heart towards the heavens child": "2248473131",
        "beneath the valley of blight": "976223942",
        "solace in solitude": "3238470200",
        "Hermit Knight": "3316688626",
        "Short Stories": "403142247",
        "Short Stories II": "894270614",
        "short stories III": "1451099497",
        "Goblings: a whimsical goblin adventure": "997904161",
        "RemembranceFernmage / Hermit Knight": "2754216090",
        "RendezvousSnawfuss / Hermit Knight": "86915145",
        "Ringbearer / Hermit KnightRingbearer / Hermit Knight": "959996376",
        "Split w/ ETVRNE": "873513215",
        "It's time to rest my friend. (The Rainbow Bridge is Calling)": "2323639176",
    },
    "woodland-spells": {
        "Key XXX: All that the Rain PromisesLichencloak": "2496920119",
        "Key XXIX: The Disquieting Realm of SleepArtemisia Vulgaris": "2835950723",
        "Key XXVIII: The Anxiety of EntropyAthshean": "4027195136",
        "Key XXVII: The Forest's Own DreamWoodland Spells": "2836996452",
        "Key XXVI: Hidden LifeLichencloak": "311601243",
        "Key XXV: The LightfootedWandlimb": "2120427902",
        "Key XXIV: From Seeds to FlowersDusklight": "3765687451",
        "Key XXIII: CloudkeepFourthpeak/Dusklight": "934412543",
        "Key XXII: With Chalice & KeyDream Chalice/Keys to Oneiria": "2369101776",
        "Key XXI: Through the Portal of SerendipityDusklight": "3561854258",
        "Key XX: Nothing Ever BeginsAthshean": "128521395",
        "Key XIX: EphialtesNocturnal Apparition": "3758557438",
        "Key XVIII: Harvest TalesWoodland Spells": "3871961012",
        "Key XVII: OtherworldAthshean": "3237392911",
        "Key XVI: The Book of WonderDusklight": "3118350832",
        "Key XV: Entish Songs of Loss & LongingNebelkrähe/Woodland Spells": "2312660023",
        "Key XIV: Enchantment & SerenityDusklight": "1747122653",
        "Key XIII: Amaranthine WoodlandsWoodland Spells": "1544788671",
        "Key XII: Grottos & GrovesWoodland Spells/Hidden Passage": "686479474",
        "Key XI: Autumn's Mournful EmbraceMisery/Sylvan Specter": "2304430437",
        "Key X: The Magic of HeliosDusklight": "2860924460",
        "Key IX: Drawing Forth the Spirits of AutumnSylvan Specter": "3105400434",
        "Key VIII: The Last Spell of Receding TreesWoodland Spells/Willow Tea": "4064667777",
        "Key VII: Meditation Magic & Dusklit DreamsDusklight": "1214769393",
        "Key VI: Earthen IncantationsWoodland Spells": "2665127555",
        "Key V: Symposium of DreamersAlkilith/Keys to Oneiria": "2668223528",
        "Key IV: Ancient Woodland WanderingsWandlimb": "3547726949",
        "Key III: Pathways to Snow Capped SpiresWinter Pathways/Snowspire": "1469613981",
        "Key II: UndergrowthWoodland Spells": "2496417811",
        "Key I: CompendiumKeys to Oneiria": "74301147",
    },
    "mortwight": {
        "Western Death Spells/An Unsustainable HorrorMortwight, Blood Tower": "539945595",
        "Demonstration MMXXV": "4020159627",
        "Midwestern Anti-heroics: Live MMXXIV": "2585793768",
        "In Violent Shadow": "1169406791",
        "Mortwight & Vermin HallsMortwight, Vermin Halls": "3952654096",
        "Militant Melancholia": "3105921310",
        "Ephemera": "4120473747",
        "Mortwight / Wayward ShrineMortwight, Wayward Shrine": "3196070755",
        "Death InitiationAstral Death, Mortwight": "3811210865",
        "MMXIX-MMXXI Compilation": "31383616",
        "Stygian Facades": "3057025498",
        "Demo MMXXII: A Triumph Laurel for the Dead": "1018382057",
        "Beneath Autumn StarsMortwight, Illuminator": "3459508684",
        "Consecrated by the Coming of DeathMorbærsanger, Mortwight": "114054806",
        "All Light DiesLambent, Mortwight": "3252721525",
        "Ancestor Cult": "2009537692",
        "A History of MourningMortwight, Forgotten Ghost": "1209563696",
        "The Far Shores": "587938548",
        "Only the Dead...": "192160353",
        "This Body Is Not Mine": "4250572522",
        "Ides Rehearsal": "2412307740",
        "Stygian Steel": "139028181",
        "Beacons Burning on the Winter HorizonEncloaked, Mortwight, Castle Zagyx": "477413474",
        "Mortwight": "684909049",
    },
    "foglord": {
        "Lore of the Blue Mist": "350736781",
        "Triune of StarsArthuros / Foglord / Weress": "4070463542",
        "Hymns of the Winterlight": "3733218881",
        "North HillSnawfuss / Foglord": "542746138",
        "In the Kingdom of FogFog Castle / Foglord / Fogweaver": "1697067037",
        "Tales From the Woods": "1315377635",
        "Stillness": "679543377",
        "The Healing Gardens": "3514592285",
        "Winter Dreams": "3374387803",
        "Celestial [Remaster]": "2967065832",
        "Celestial": "3026094752",
        "The Old Wanderers Tale": "317426533",
        "FimbulwinterFoglord / Elador": "3900069281",
        "Journey of the Spirits (Reissue)": "3367276651",
        "Journey of the Spirits": "536289598",
        "Demo 2014": "2450245604",
        "In the Essence of Astral Solitude (Reissue)": "3864206928",
        "In the Essence of Astral Solitude": "197931700",
        "New Realms and Forgotten Lands": "3394470427",
        "In a Darkened Age": "2025835111",
        "Demo 2011": "4138052913",
    },
    "bergtatt": {
        "bergtatt ii": "4251103996",
        "lunar mysteries iv": "217443087",
        "shadow mountain": "3279996140",
        "lunar mysteries iii": "726252364",
        "lunar mysteries ii": "1834454500",
        "bergtatt": "107629232",
        "lunar mysteries": "3165750786",
        "labyrinthine subterranean passages": "221402953",
        "traversing celestial realms": "540746378",
    },
    "unsheathed-glory": {
        "Beneath Sun & Soil": "1986344633",
        "EilenachEilenach": "2564306348",
        "Fables from Featherwood Forest": "2087741473",
        "The Siege of Charvencia Keep": "2519245850",
        "Tales from Toasty Troll Tavern": "882688448",
        "A Journey Through Realm and Region": "3446061804",
        "Awakening of Skyfrost Tower": "3828722801",
        "In Search of The Lost Land": "3680785819",
        "The Rivals": "2543019495",
        "The Maze of the MinotaurUnsheathed Glory & Mortal Relic": "452810843",
        "Night's Shadow DarkeningUnsheathed Glory / Ozeregroth": "2970384319",
        "The Adventures of Sklugg & BarbUnsheathed Glory and Fen Wraith": "1724296416",
    },
    "fernmage": {
        "________!!! It's a ______ Dragon!": "2107315007",
        "Moss WeinerHot Dog Cart & Fernmage": "1497554269",
        "Lore (Eldslunds)": "4262735221",
        "Yellow Morel Orchestra-Live from WoodhavenFernmage/Moss Knight": "4157368878",
        "Briarsbane\u2014A Side Quest": "1596925587",
        "Brackenbard\u2014A Side Quest": "1169065115",
        "Fiddlehead Forge\u2014A Side Quest": "1884301554",
        "Vales of Light // Realms of Shadow": "431134282",
        "RemembranceFernmage/Hermit Knight": "2292511494",
        "Cruzin\u2019 4 A Snoozin": "3978248811",
        "Brrrrackenlore": "4016883861",
        "Speak Frond and Enter": "22955945",
        "Brackenlore": "475018528",
    },
    "fenwalker": {
        "Swords Against the Lich LordImp and Fen Walker": "1819424928",
        "Behold! Visions From the Scrying Pool!Fen Walker & Scrying Glass": "4029292338",
        "Fare Thee Well Battle Winds": "1680752858",
        "Hark! The Whispering Dead of the Burial Lake": "666655706",
        "Saga I": "2335861541",
        "Sojourns in the Realm of the Undermoon": "2156305278",
        "The Totem Wilds Call Thy Name": "417470656",
        "Hail! O\u2019 Barrow Lands!": "1421240358",
    },
    "wood-archer": {
        "In Memory of Echoes": "1420373601",
        "The Black Arrows of Twilight": "1776490096",
        "The Wounded Desire": "2670907271",
        "In the Plague of Tyrants": "935548263",
        "The Blinding Darkness": "2433012879",
        "Blood Moon Sorcery": "3534639833",
        "Hiding the Children": "2521778369",
        "To Pierce a Monarch": "1413216152",
        "The Magic Familiar": "4050283091",
    },
    "moss-helm": {
        "Demo II": "778182488",
        "Demo I": "3592789570",
    },
    "meadowgoat": {
        "Goat Meadow": "3203041734",
        "By the Pond": "3449993409",
    },
    "fogweaver": {
        "Key XXX: All that the Rain PromisesLichencloak": "2496920119",
        "Key XXIX: The Disquieting Realm of SleepArtemisia Vulgaris": "2835950723",
        "Key XXVIII: The Anxiety of EntropyAthshean": "4027195136",
        "Key XXVII: The Forest's Own DreamWoodland Spells": "2836996452",
        "Key XXVI: Hidden LifeLichencloak": "311601243",
        "Key XXV: The LightfootedWandlimb": "2120427902",
        "Key XXIV: From Seeds to FlowersDusklight": "3765687451",
        "Key XXIII: CloudkeepFourthpeak/Dusklight": "934412543",
        "Key XXII: With Chalice & KeyDream Chalice/Keys to Oneiria": "2369101776",
        "Key XXI: Through the Portal of SerendipityDusklight": "3561854258",
        "Key XX: Nothing Ever BeginsAthshean": "128521395",
        "Key XIX: EphialtesNocturnal Apparition": "3758557438",
        "Key XVIII: Harvest TalesWoodland Spells": "3871961012",
        "Key XVII: OtherworldAthshean": "3237392911",
        "Key XVI: The Book of WonderDusklight": "3118350832",
        "Key XV: Entish Songs of Loss & LongingNebelkrähe/Woodland Spells": "2312660023",
        "Key XIV: Enchantment & SerenityDusklight": "1747122653",
        "Key XIII: Amaranthine WoodlandsWoodland Spells": "1544788671",
        "Key XII: Grottos & GrovesWoodland Spells/Hidden Passage": "686479474",
        "Key XI: Autumn's Mournful EmbraceMisery/Sylvan Specter": "2304430437",
        "Key X: The Magic of HeliosDusklight": "2860924460",
        "Key IX: Drawing Forth the Spirits of AutumnSylvan Specter": "3105400434",
        "Key VIII: The Last Spell of Receding TreesWoodland Spells/Willow Tea": "4064667777",
        "Key VII: Meditation Magic & Dusklit DreamsDusklight": "1214769393",
        "Key VI: Earthen IncantationsWoodland Spells": "2665127555",
        "Key V: Symposium of DreamersAlkilith/Keys to Oneiria": "2668223528",
        "Key IV: Ancient Woodland WanderingsWandlimb": "3547726949",
        "Key III: Pathways to Snow Capped SpiresWinter Pathways/Snowspire": "1469613981",
        "Key II: UndergrowthWoodland Spells": "2496417811",
        "Key I: CompendiumKeys to Oneiria": "74301147",
    },
}

# Bands whose album list was erased; restore from known artwork files
RESTORE_ALBUMS = {
    "hole-dweller": {
        "base_url": "https://holedweller.bandcamp.com",
        "entries": [
            ("flies the coop",                          "3942234626"),
            ("flies the coop II",                       "3069687900"),
            ("flies the coop III",                      "1274138815"),
            ("Crossroads",                              "2091304632"),
            ("another chance at peace",                 "2936647780"),
            ("With Dreams of Hereafter",                "1620656061"),
            ("Returns to Roost",                        "2989657906"),
            ("Endless Night",                           "51460799"),
            ("Hole in One",                             "3157837652"),
            ("Hollowed Out (feat. Barre Gambling)",     "1585091174"),
            ("the first of yule [demo]",                "662928034"),
            ("Winterlude [single]",                     "3262189254"),
            ("The Elven Door [single]",                 "1310795844"),
            ("Wolves in the Hen House [EP]",            "967709957"),
        ],
    },
    "malfet": {
        "base_url": "https://malfet.bandcamp.com",
        "entries": [
            ("Dolorous Gard",    "1072151547"),
            ("Alban Arthan",     "665603629"),
            ("The Glimmering",   "288325961"),
            ("The Way To Avalon","961670542"),
            ("The Snaking Path", "4045728393"),
        ],
    },
    "fenwalker": {
        "base_url": "https://fenwalker.bandcamp.com",
        "entries": [
            ("Swords Against the Lich LordImp and Fen Walker",                         "1819424928"),
            ("Behold! Visions From the Scrying Pool!Fen Walker & Scrying Glass",       "4029292338"),
            ("Fare Thee Well Battle Winds",                                             "1680752858"),
            ("Hark! The Whispering Dead of the Burial Lake",                           "666655706"),
            ("Saga I",                                                                  "2335861541"),
            ("Sojourns in the Realm of the Undermoon",                                 "2156305278"),
            ("The Totem Wilds Call Thy Name",                                          "417470656"),
            ("Hail! O\u2019 Barrow Lands!",                                            "1421240358"),
        ],
    },
}

ART_ROOT = pathlib.Path(r"C:\Users\snowb\Programs\mcdev\mcdev\public\bandcamp_artwork")

def fix_path(p):
    if not p:
        return p
    v = p.replace("\\", "/")
    return v if v.startswith("/") else "/" + v

with open(JSON_PATH, encoding="utf-8") as f:
    data = json.load(f)

for band_id, band in data.items():
    # Fix artist image path
    if band.get("artist_image"):
        band["artist_image"] = fix_path(band["artist_image"])

    # Restore erased album lists
    if band_id in RESTORE_ALBUMS and not band.get("albums"):
        info = RESTORE_ALBUMS[band_id]
        band["albums"] = []
        for title, album_id in info["entries"]:
            art_file = ART_ROOT / band_id / f"{title}.jpg"
            art_path = f"/bandcamp_artwork/{band_id}/{title}.jpg" if art_file.exists() else None
            band["albums"].append({
                "title": title,
                "url": info["base_url"],
                "release_date": None,
                "artwork": art_path,
                "album_id": album_id,
            })

    # Fix artwork paths and inject album IDs for existing albums
    id_map = IDS.get(band_id, {})
    for album in band.get("albums", []):
        if album.get("artwork"):
            album["artwork"] = fix_path(album["artwork"])
        if album["title"] in id_map:
            album["album_id"] = id_map[album["title"]]

with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

# Verify
with open(JSON_PATH, encoding="utf-8") as f:
    data = json.load(f)
for k, v in data.items():
    ids = sum(1 for a in v.get("albums", []) if a.get("album_id"))
    total = len(v.get("albums", []))
    img_ok = (v.get("artist_image") or "/").startswith("/")
    print(f"{k}: {ids}/{total} albums with IDs, img_ok={img_ok}")
