import { handleDrm } from '../server/drm.mjs';
export default async function handler(req, res) {
  return handleDrm(req, res);
}
