const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "../app/images.js"), "utf8")
  .replace(/export /g, "");

function setup({ webp = "image/webp", jpeg = "image/jpeg", png = "image/png",
  width = 3000, height = 2000, decodeFails = false } = {}) {
  const calls = [];
  const revoked = [];
  let drawnSize;
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: () => { drawnSize = [canvas.width, canvas.height]; } }),
    toBlob(callback, type) {
      calls.push(type);
      const result = { "image/webp": webp, "image/jpeg": jpeg, "image/png": png }[type];
      if (result === "throw") throw new Error("encoder failure");
      callback(result ? new Blob(["image bytes"], { type: result }) : null);
    }
  };
  const context = vm.createContext({
    Image: class {
      naturalWidth = width; naturalHeight = height;
      async decode() { if (decodeFails) throw new Error("cannot decode"); }
    },
    FileReader: class {
      readAsDataURL(blob) {
        this.result = `data:${blob.type};base64,aW1hZ2U=`;
        this.onload();
      }
    },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: url => revoked.push(url) },
    document: { createElement: () => canvas }
  });
  vm.runInContext(source, context);
  return { prepare: context.prepareUploadImage, canvas, calls, revoked,
    drawnSize: () => drawnSize };
}

const photo = { type: "image/jpeg", name: "photo.jpg", size: 100 };

test("supported browsers save real WebP and resize without upscaling", async () => {
  const env = setup();
  assert.match(await env.prepare(photo), /^data:image\/webp;/);
  assert.deepEqual(env.drawnSize(), [1600, 1067]);
  assert.equal(env.canvas.width, 0);
  assert.deepEqual(env.revoked, ["blob:test"]);
  const small = setup({ width: 100, height: 50 });
  await small.prepare(photo);
  assert.deepEqual(small.drawnSize(), [100, 50]);
});

test("Safari-style PNG response to WebP request falls back to JPEG for photos", async () => {
  const env = setup({ webp: "image/png" });
  assert.match(await env.prepare(photo), /^data:image\/jpeg;/);
  assert.deepEqual(env.calls, ["image/webp", "image/jpeg"]);
});

test("PNG and WebP sources retain a PNG fallback for transparency", async () => {
  for (const type of ["image/png", "image/webp"]) {
    const env = setup({ webp: "image/png" });
    assert.match(await env.prepare({ ...photo, type }), /^data:image\/png;/);
    assert.deepEqual(env.calls, ["image/webp", "image/png"]);
  }
});

test("null and throwing WebP encoders still allow an upload", async () => {
  for (const webp of [null, "throw"]) {
    assert.match(await setup({ webp }).prepare(photo), /^data:image\/jpeg;/);
  }
});

test("PNG remains available when neither WebP nor JPEG can be encoded", async () => {
  const env = setup({ webp: null, jpeg: "image/png" });
  assert.match(await env.prepare(photo), /^data:image\/png;/);
});

test("empty MIME with a JPEG extension uses the photo fallback", async () => {
  assert.match(await setup({ webp: null }).prepare({ ...photo, type: "", name: "PHOTO.JPG" }),
    /^data:image\/jpeg;/);
});

test("HEIC is attempted when decodable, otherwise gives conversion guidance", async () => {
  const heic = { ...photo, type: "image/heic", name: "camera.heic" };
  assert.match(await setup({ webp: null }).prepare(heic), /^data:image\/jpeg;/);
  const env = setup({ decodeFails: true });
  await assert.rejects(env.prepare(heic), /HEIC\/HEIF.*JPG.*截图/);
  assert.deepEqual(env.revoked, ["blob:test"]);
});

test("oversized files and non-images are rejected before allocation", async () => {
  const env = setup();
  await assert.rejects(env.prepare({ ...photo, size: 12 * 1024 * 1024 + 1 }), /12MB/);
  await assert.rejects(env.prepare({ ...photo, type: "application/pdf", name: "file.pdf" }), /请选择/);
  assert.deepEqual(env.calls, []);
});

test("unreadable files and excessive dimensions produce specific errors and release resources", async () => {
  const env = setup({ decodeFails: true });
  await assert.rejects(env.prepare(photo), /无法读取这张图片/);
  assert.deepEqual(env.revoked, ["blob:test"]);
  const large = setup({ width: 10000, height: 10000 });
  await assert.rejects(large.prepare(photo), /4000 万像素/);
  assert.deepEqual(large.calls, []);
  assert.equal(large.canvas.width, 0);
});

test("complete encoding failure does not return invalid image data", async () => {
  const env = setup({ webp: null, jpeg: null, png: null });
  await assert.rejects(env.prepare(photo), /图片处理失败/);
  assert.equal(env.canvas.width, 0);
  assert.deepEqual(env.revoked, ["blob:test"]);
});
