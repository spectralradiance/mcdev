"use client";

import React, { useState } from "react";
import { Chip, Heading, Page } from "../../ui";
import bands from "./woodlandfortress.json";
import bandcampData from "./bandcamp_data.json";

interface Band {
  id: string;
  name: string;
  isSpecialPerformance: boolean;
  tags: string[];
  description: string;
  links: { bandcamp: string; spotify: string; bandcampAlbumEmbedId: string };
}

interface Album {
  title: string;
  url: string;
  release_date: string | null;
  artwork: string | null;
  album_id?: string | null;
  description?: string | null;
}

interface ArtistData {
  artist_image: string | null;
  description?: string | null;
  albums: Album[];
}

const allTags = Array.from(
  new Set((bands as Band[]).flatMap((b) => b.tags))
).sort();

const dataMap = bandcampData as Record<string, ArtistData>;

export default function WoodlandFortressPage() {
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [selectedBandId, setSelectedBandId] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  function selectArtist(id: string) {
    if (selectedBandId === id) {
      setSelectedBandId(null);
      setSelectedAlbum(null);
    } else {
      setSelectedBandId(id);
      setSelectedAlbum(null);
    }
  }

  const filteredBands =
    activeTags.size === 0
      ? (bands as Band[])
      : (bands as Band[]).filter((b) => b.tags.some((t) => activeTags.has(t)));

  const selectedArtistData = selectedBandId
    ? (dataMap[selectedBandId] ?? null)
    : null;

  return (
    <Page size="wide" className="py-4">
      <Heading>Woodland Fortress — Bands</Heading>

      {/* Tag filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {allTags.map((tag) => (
          <Chip key={tag} active={activeTags.has(tag)} onClick={() => toggleTag(tag)}>
            {tag}
          </Chip>
        ))}
        {activeTags.size > 0 && (
          <Chip className="!border-warn !text-warn" onClick={() => setActiveTags(new Set())}>
            Clear
          </Chip>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px] overflow-hidden">

        {/* Left: band list with inline album expansion */}
        <div className="w-[420px] shrink-0 overflow-y-auto">
          {filteredBands.map((band) => {
            const artistData = dataMap[band.id];
            const photo = artistData?.artist_image;
            const isSelected = selectedBandId === band.id;
            return (
              <div key={band.id}>
                <div
                  onClick={() => selectArtist(band.id)}
                  className={`flex gap-3 p-3 cursor-pointer ${isSelected ? "bg-strong" : "hover:bg-panel"}`}
                >
                  {photo ? (
                    <img src={photo} alt={band.name} className="w-20 h-20 object-cover shrink-0" />
                  ) : (
                    <div className="w-20 h-20 shrink-0 bg-raised flex items-center justify-center text-3xl text-subtle">
                      {band.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{band.name}</div>
                    {artistData?.description && (
                      <p className="text-xs text-muted line-clamp-3">{artistData.description}</p>
                    )}
                  </div>
                </div>

                {isSelected && (artistData?.albums.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 pl-4 bg-panel">
                    {artistData!.albums.map((album) => {
                      const active = selectedAlbum?.album_id === album.album_id && selectedAlbum?.url === album.url;
                      return (
                        <div
                          key={album.url + (album.album_id ?? "")}
                          onClick={(e) => { e.stopPropagation(); setSelectedAlbum(active ? null : album); }}
                          className={`w-20 cursor-pointer hover:opacity-85 ${active ? "outline-2 outline-accent" : ""}`}
                        >
                          {album.artwork ? (
                            <img src={album.artwork} alt={album.title} className="w-20 h-20 object-cover block" />
                          ) : (
                            <div className="w-20 h-20 bg-raised" />
                          )}
                          <span className="block p-1 text-center text-[0.63rem] leading-tight">
                            {album.title}
                            {album.release_date && (
                              <span className="text-subtle">
                                {" "}· {new Date(album.release_date).getFullYear()}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: embed */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          {selectedAlbum ? (
            <>
              {selectedAlbum.album_id ? (
                <iframe
                  key={selectedAlbum.album_id}
                  title={selectedAlbum.title}
                  className="border-0 w-full h-[700px]"
                  src={`https://bandcamp.com/EmbeddedPlayer/album=${selectedAlbum.album_id}/size=large/bgcol=333333/linkcol=e99708/transparent=true/`}
                  seamless
                  allowFullScreen
                />
              ) : (
                <a href={selectedAlbum.url} target="_blank" rel="noopener noreferrer"
                   className="text-accent hover:underline">
                  Listen on Bandcamp ↗
                </a>
              )}
              {selectedAlbum.description && (
                <p className="mt-4 text-sm text-muted whitespace-pre-line">{selectedAlbum.description}</p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted">
              Select an album to listen
            </div>
          )}
        </div>

      </div>
    </Page>
  );
}
