'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const cloudinary = require('cloudinary').v2;
const fs   = require('fs');
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const UPLOADS_DIR = path.join(__dirname, '../uploads');

const FILES = [
  { file: 'photo_1778597401310_rl0idms7rh.jpg',   folder: 'meridian/profiles/photos',   key: 'rodriguez_photo' },
  { file: 'id_1778587230036_vnxn8effk1t.png',      folder: 'meridian/profiles/id-cards', key: 'rodriguez_id' },
  { file: 'photo_1778597487665_su8yctrb2mk.jpg',  folder: 'meridian/profiles/photos',   key: 'ummay_photo' },
  { file: 'id_1778587648009_uwpo3iu1xa.jpg',       folder: 'meridian/profiles/id-cards', key: 'ummay_id' },
  { file: 'watch_1778589225858_njxgwp1ghq.jpg',    folder: 'meridian/watches',           key: 'watch_nautilus' },
  { file: 'watch_1778589162104_9gm5baj0i19.jpg',   folder: 'meridian/watches',           key: 'watch_calatrava' },
  { file: 'watch_1778589125371_pu4iohh03s.jpg',    folder: 'meridian/watches',           key: 'watch_twenty4' },
  { file: 'cdoc_1778589727567_761yjzebjzo.pdf',    folder: 'meridian/company-docs',      key: 'cdoc_1' },
];

async function upload(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', use_filename: true, unique_filename: false },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    fs.createReadStream(path.join(UPLOADS_DIR, file)).pipe(stream);
  });
}

(async () => {
  const results = {};
  for (const f of FILES) {
    process.stdout.write(`Uploading ${f.file}... `);
    try {
      results[f.key] = await upload(f.file, f.folder);
      console.log('✓');
    } catch (e) {
      console.log('FAILED:', e.message);
      results[f.key] = null;
    }
  }
  console.log('\n=== CLOUDINARY URLS ===\n');
  console.log(JSON.stringify(results, null, 2));
})();
