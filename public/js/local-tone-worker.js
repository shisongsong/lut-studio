import { fastLocalLaplacianEV } from './local-laplacian.js';

self.onmessage = ({ data }) => {
  const { id, key, width, height, evMap, exposure = 0, shadows = 0, highlights = 0 } = data;
  try {
    const sceneEV = new Float32Array(evMap);
    if (exposure) for (let i = 0; i < sceneEV.length; i++) sceneEV[i] += exposure;
    const delta = fastLocalLaplacianEV(sceneEV, width, height, { shadows, highlights });
    self.postMessage({ id, key, ok: true, width, height, delta: delta.buffer }, [delta.buffer]);
  } catch (error) {
    self.postMessage({ id, key, ok: false, message: String(error?.message || error) });
  }
};
