// Wrapper untuk AI image generation.
// Provider utama: Pollinations.ai (gratis, tanpa API key).
// Provider fallback: Pollinations model turbo (lebih cepat, kualitas sedikit turun).

import axios from "axios";

const MODELS = {
  default: "flux",         // kualitas terbaik, sedikit lebih lambat
  realism: "flux-realism", // foto realistis
  anime: "flux-anime",     // gaya anime
  fast: "turbo",           // cepat, kualitas lebih rendah
  "3d": "flux-3d",         // gaya 3D render
};

// Daftar model yang diekspos ke user
export const IMAGE_MODELS = Object.keys(MODELS);

// Generate gambar dari prompt, kembalikan Buffer PNG/JPG
export async function generateImage(prompt, modelKey = "default", options = {}) {
  const { width = 1024, height = 1024, seed } = options;
  const model = MODELS[modelKey] || MODELS.default;

  const params = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: "true",
    enhance: "true",
  });
  if (seed != null) params.set("seed", String(seed));

  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?${params}`;

  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 90000, // Pollinations bisa lambat di cold-start, beri 90 detik
    headers: {
      Accept: "image/*",
    },
  });

  const buffer = Buffer.from(data);

  // Validasi minimal: harus ada data dan minimal 1 KB (bukan error HTML)
  if (!buffer || buffer.length < 1024) {
    throw new Error("Response terlalu kecil, bukan gambar valid");
  }

  return buffer;
}

// Coba generate dengan fallback otomatis ke model 'turbo' bila gagal
export async function generateImageWithFallback(prompt, modelKey = "default", options = {}) {
  // Coba model yang diminta
  try {
    return await generateImage(prompt, modelKey, options);
  } catch (err) {
    if (modelKey === "fast") throw err; // sudah di model tercepat, tidak ada fallback lagi
    // Fallback ke turbo
    return await generateImage(prompt, "fast", options);
  }
}
