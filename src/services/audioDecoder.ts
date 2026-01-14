/**
 * 音频解码服务
 * 负责将音视频文件解码为 PCM 数据
 */

/**
 * 解码后的音频数据
 */
export interface DecodedAudio {
  pcm: Float32Array;     // PCM 音频数据
  sampleRate: number;    // 采样率
  duration: number;      // 时长（秒）
}

/**
 * 解码音视频文件为 PCM 数据
 * @param fileRef - 文件引用
 * @param targetSampleRate - 目标采样率，默认 16000Hz
 * @returns 解码后的音频数据
 */
export const decodeAudioFile = async (
  fileRef: File,
  targetSampleRate: number = 16000
): Promise<DecodedAudio> => {
  // 读取文件
  const arrayBuffer = await fileRef.arrayBuffer();

  // 解码音频（16kHz 单声道）
  const audioContext = new AudioContext({ sampleRate: targetSampleRate });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // 获取 PCM 数据（单声道）
  const pcm = audioBuffer.getChannelData(0); // Float32Array
  const duration = pcm.length / targetSampleRate; // 时长（秒）

  return {
    pcm,
    sampleRate: targetSampleRate,
    duration
  };
};
