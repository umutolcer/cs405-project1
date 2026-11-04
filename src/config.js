/**
 * The painting used by this project:
 * Şeker Ahmed Paşa — Kavunlu Natürmort (Sakıp Sabancı Museum collection).
 *
 * The curve in Part D is traced over the melon's outline, so the control
 * points are specific to this image (1280 × 893 px).
 */
export const PAINTING = {
  id: 'kavunlu',
  file: 'kavunlu.jpg',
  artist: 'Şeker Ahmed Paşa',
  title: 'Kavunlu Natürmort',
  size: [1280, 893],
};

export const paintingURL = () => `${import.meta.env.BASE_URL}paintings/${PAINTING.file}`;
