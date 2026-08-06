"use client";

import React, { useState } from "react";
import { Box, Chip, Typography } from "@mui/material";
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
    <Box sx={{ maxWidth: 1400, mx: "auto", px: 3, py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Woodland Fortress — Bands
      </Typography>

      {/* Tag filters */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
        {allTags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            onClick={() => toggleTag(tag)}
            color={activeTags.has(tag) ? "primary" : "default"}
            variant={activeTags.has(tag) ? "filled" : "outlined"}
            size="small"
            sx={
              activeTags.has(tag)
                ? {}
                : { color: "white", borderColor: "rgba(255,255,255,0.4)" }
            }
          />
        ))}
        {activeTags.size > 0 && (
          <Chip
            label="Clear"
            onClick={() => setActiveTags(new Set())}
            color="warning"
            size="small"
          />
        )}
      </Box>

      {/* Two-column layout */}
      <Box sx={{ display: "flex", gap: 2, height: "calc(100vh - 180px)", overflow: "hidden" }}>

        {/* Left: band list with inline album expansion */}
        <Box sx={{ width: 420, flexShrink: 0, overflowY: "auto" }}>
          {filteredBands.map((band) => {
            const artistData = dataMap[band.id];
            const photo = artistData?.artist_image;
            const isSelected = selectedBandId === band.id;
            return (
              <Box key={band.id}>
                <Box
                  onClick={() => selectArtist(band.id)}
                  sx={{
                    display: "flex", gap: 1.5, p: 1.5, cursor: "pointer",
                    bgcolor: isSelected ? "primary.dark" : "transparent",
                    "&:hover": { bgcolor: isSelected ? "primary.dark" : "grey.900" },
                  }}
                >
                  {photo ? (
                    <Box component="img" src={photo} alt={band.name}
                      sx={{ width: 80, height: 80, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <Box sx={{ width: 80, height: 80, bgcolor: "grey.800", flexShrink: 0,
                               display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Typography sx={{ fontSize: "2rem", color: "grey.500" }}>{band.name.charAt(0)}</Typography>
                    </Box>
                  )}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{band.name}</Typography>
                    {artistData?.description && (
                      <Typography variant="caption" sx={{
                        color: "grey.400", display: "-webkit-box",
                        WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                      }}>
                        {artistData.description}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {isSelected && (artistData?.albums.length ?? 0) > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1, pl: 2, bgcolor: "grey.900" }}>
                    {artistData!.albums.map((album) => {
                      const active = selectedAlbum?.album_id === album.album_id && selectedAlbum?.url === album.url;
                      return (
                        <Box
                          key={album.url + (album.album_id ?? "")}
                          onClick={(e) => { e.stopPropagation(); setSelectedAlbum(active ? null : album); }}
                          sx={{
                            width: 80, cursor: "pointer",
                            outline: active ? "2px solid" : "none",
                            outlineColor: "secondary.main",
                            "&:hover": { opacity: 0.85 },
                          }}
                        >
                          {album.artwork ? (
                            <Box component="img" src={album.artwork} alt={album.title}
                              sx={{ width: 80, height: 80, objectFit: "cover", display: "block" }} />
                          ) : (
                            <Box sx={{ width: 80, height: 80, bgcolor: "grey.800" }} />
                          )}
                          <Typography variant="caption" sx={{
                            display: "block", fontSize: "0.63rem", lineHeight: 1.2,
                            p: 0.5, textAlign: "center",
                          }}>
                            {album.title}
                            {album.release_date && (
                              <Box component="span" sx={{ color: "grey.500" }}>
                                {" "}· {new Date(album.release_date).getFullYear()}
                              </Box>
                            )}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Right: embed */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 2 }}>
          {selectedAlbum ? (
            <>
              {selectedAlbum.album_id ? (
                <iframe
                  key={selectedAlbum.album_id}
                  title={selectedAlbum.title}
                  style={{ border: 0, width: "100%", height: 700 }}
                  src={`https://bandcamp.com/EmbeddedPlayer/album=${selectedAlbum.album_id}/size=large/bgcol=333333/linkcol=e99708/transparent=true/`}
                  seamless
                  allowFullScreen
                />
              ) : (
                <Box component="a" href={selectedAlbum.url} target="_blank" rel="noopener noreferrer"
                     sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
                  Listen on Bandcamp ↗
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center",
                       height: "100%", color: "text.secondary" }}>
              <Typography>Select an album to listen</Typography>
            </Box>
          )}
        </Box>

      </Box>
    </Box>
  );
}

