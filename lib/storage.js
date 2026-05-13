'use strict';

/**
 * Unified file storage — Cloudinary when env vars are set, local disk otherwise.
 * All routes upload via this module so switching storage needs no route changes.
 */

const path = require('path');
const fs   = require('fs');
const { UPLOADS_DIR } = require('../config');

const useCloud = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY    &&
  process.env.CLOUDINARY_API_SECRET
);

let cloudinary;
if (useCloud) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('[storage] Cloudinary enabled');
} else {
  console.log('[storage] Local disk storage (set CLOUDINARY_* env vars to enable cloud)');
}

/**
 * Upload a multer file object (with .buffer) to storage.
 * Returns a URL string.
 */
async function uploadFile(file, folder = 'meridian') {
  if (useCloud) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'auto', use_filename: false },
        (err, result) => err ? reject(err) : resolve(result.secure_url)
      );
      stream.end(file.buffer);
    });
  }

  // Local disk fallback
  const ext  = path.extname(file.originalname).toLowerCase();
  const name = `${file.fieldname}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), file.buffer);
  return `/uploads/${name}`;
}

/**
 * Delete a file by its stored URL.
 * Handles both Cloudinary URLs and legacy local /uploads/ paths.
 */
async function deleteFile(url) {
  if (!url) return;

  if (url.includes('cloudinary.com')) {
    // Extract resource_type and public_id from URL
    // e.g. https://res.cloudinary.com/demo/image/upload/v123/meridian/profiles/abc.jpg
    const match = url.match(/\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    if (!match) return;
    const [, resource_type, public_id] = match;
    await cloudinary.uploader.destroy(public_id, { resource_type }).catch(() => {});
    return;
  }

  if (url.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOADS_DIR, path.basename(url)), () => {});
  }
}

module.exports = { uploadFile, deleteFile, useCloud };
