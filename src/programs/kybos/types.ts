export interface Params {
  n_dimensions: number;
  n_divisions: number;
  speed: number;
  accentuation: number;
  line_width: number;
  face_alpha: number;
  glow: number;
  persp_dist: number;
  vertex_size: number;
}

export const INIT: Params = {
  n_dimensions: 4,
  n_divisions: 8,
  speed: 3,
  accentuation: 95,
  line_width: 4,
  face_alpha: 12,
  glow: 0,
  persp_dist: 5,
  vertex_size: 10,
};
