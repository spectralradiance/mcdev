export interface Params {
  n_dimensions: number;
  n_divisions: number;
  speed: number;
  accentuation: number;
  line_width: number;
}

export const INIT: Params = {
  n_dimensions: 4,
  n_divisions: 8,
  speed: 10,
  accentuation: 95,
  line_width: 4,
};
