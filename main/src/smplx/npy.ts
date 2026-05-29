import { unzip } from 'fflate';

export type NdArray = {
  dtype: string;
  shape: number[];
  fortranOrder: boolean;
  /** Always a JS number-backed typed array (Float32Array for floats, Int32Array for ints). */
  data: Float32Array | Int32Array | Uint32Array;
};

/**
 * Parse a single `.npy` buffer (NumPy's array serialization format).
 * Spec: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 */
export function parseNpy(bytes: Uint8Array): NdArray {
  // Magic string: \x93NUMPY
  if (bytes[0] !== 0x93 || bytes[1] !== 0x4e) {
    throw new Error('Not a valid .npy file (bad magic).');
  }
  const major = bytes[6];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let headerLen: number;
  let headerStart: number;
  if (major === 1) {
    headerLen = view.getUint16(8, true);
    headerStart = 10;
  } else {
    // v2/v3 use a 4-byte header length
    headerLen = view.getUint32(8, true);
    headerStart = 12;
  }

  const headerStr = new TextDecoder('latin1').decode(
    bytes.subarray(headerStart, headerStart + headerLen)
  );

  const descrMatch = headerStr.match(/'descr'\s*:\s*'([^']+)'/);
  const fortranMatch = headerStr.match(/'fortran_order'\s*:\s*(True|False)/);
  const shapeMatch = headerStr.match(/'shape'\s*:\s*\(([^)]*)\)/);
  if (!descrMatch || !shapeMatch) throw new Error('Malformed .npy header.');

  const dtype = descrMatch[1];
  const fortranOrder = fortranMatch ? fortranMatch[1] === 'True' : false;
  const shape = shapeMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 10));

  const dataStart = headerStart + headerLen;
  // Copy into a fresh, element-aligned buffer.
  const raw = bytes.slice(dataStart);
  const count = shape.reduce((a, b) => a * b, 1);

  let data: Float32Array | Int32Array | Uint32Array;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  switch (dtype) {
    case '<f4':
    case '|f4':
      data = new Float32Array(raw.buffer, 0, count);
      break;
    case '<f8':
    case '|f8': {
      const f64 = new Float64Array(raw.buffer, 0, count);
      data = Float32Array.from(f64);
      break;
    }
    case '<i4':
    case '|i4':
      data = new Int32Array(raw.buffer, 0, count);
      break;
    case '<u4':
    case '|u4':
      data = new Uint32Array(raw.buffer, 0, count);
      break;
    case '<i8':
    case '<u8': {
      // 64-bit integers (kintree, faces) -> read low word as int32 (values are small).
      const out = new Int32Array(count);
      for (let i = 0; i < count; i++) out[i] = dv.getInt32(i * 8, true);
      data = out;
      break;
    }
    case '|u1':
    case '|b1': {
      const out = new Int32Array(count);
      for (let i = 0; i < count; i++) out[i] = raw[i];
      data = out;
      break;
    }
    default:
      throw new Error(`Unsupported dtype: ${dtype}`);
  }

  if (fortranOrder && shape.length > 1) {
    throw new Error('Fortran-ordered arrays are not supported.');
  }

  return { dtype, shape, fortranOrder, data };
}

/** Unzip an `.npz` archive and parse every contained `.npy` entry. */
export function parseNpz(bytes: Uint8Array): Promise<Record<string, NdArray>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (err, files) => {
      if (err) return reject(err);
      try {
        const out: Record<string, NdArray> = {};
        for (const name of Object.keys(files)) {
          if (!name.endsWith('.npy')) continue;
          const key = name.replace(/\.npy$/, '');
          out[key] = parseNpy(files[name]);
        }
        resolve(out);
      } catch (e) {
        reject(e);
      }
    });
  });
}
