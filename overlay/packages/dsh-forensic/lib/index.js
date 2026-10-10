/**
 * @deepseek-ai/dsh-forensic — bundle 宿主半侧。
 *
 * bundle 本体只承载补丁层（cordis.patch.yml）；这里提供一个空的 apply，
 * 让 Loader 有一个可挂载的宿主行。
 */
/** Bundle host body — all contribution lives in cordis.patch.yml. */
export function apply() {}
export default { apply };
