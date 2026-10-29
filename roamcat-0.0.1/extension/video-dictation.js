/**
 * @file video-dictation.js
 * 文件职责：用户主动开启后的播放器音轨采集；独立 WebM 片段、有限队列与完整释放。
 * 不申请麦克风；拖动、倍速变化、切页或广告出现即停止，防止字幕时间轴错位。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
(() => {
  if (globalThis.RoamCatVideoDictation) return;
  const T = key => globalThis.RoamCatI18n?.t?.(key) ?? key;
  function create({video, transcribe, onSegments, onStatus, eligible = () => true}) {
    if (!video?.captureStream || !globalThis.MediaRecorder || !MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) throw new Error(T('vid.asrUnsupported'));
    let stream, recorder, timer, watchdog, stopped = false, busy = false, finishing = false, buffering = false;
    const queue = [], listeners = [];
    function status(key) { onStatus?.(T(key)); }
    function stop(reason = '') {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer); clearInterval(watchdog); queue.length = 0;
      for (const [target, name, fn] of listeners) target.removeEventListener(name, fn);
      if (recorder?.state !== 'inactive') { try { recorder?.stop(); } catch { /* already stopped */ } }
      for (const track of stream?.getTracks() || []) track.stop();
      onStatus?.(reason, true);
    }
    const fail = error => stop(error?.message || T('vid.asrFailed'));
    async function drain() {
      if (busy || stopped) return;
      busy = true;
      try {
        while (queue.length && !stopped) {
          const {blob, start, duration, rate} = queue.shift();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          if (stopped) break;
          status('vid.asrTranscribing');
          const result = await transcribe({base64: btoa(binary), mimeType: 'audio/webm', duration});
          if (stopped) break;
          onSegments(result.segments.map(item => ({startTime: start + item.start * rate, endTime: start + item.end * rate, text: item.text, translation: item.translation})), start, start + duration * rate);
          status(video.paused ? 'vid.asrPaused' : 'vid.asrRecording');
        }
      } catch (error) { fail(error); }
      finally { busy = false; if (finishing && !queue.length) stop(T('vid.asrComplete')); }
    }
    function finishClip(discard = false) {
      clearTimeout(timer);
      if (!recorder || recorder.state === 'inactive') return;
      recorder.clipEnd = video.currentTime;
      recorder.discard = discard;
      recorder.stop();
    }
    function record() {
      if (stopped || finishing || buffering || video.paused || video.ended || recorder?.state === 'recording') return;
      if (!eligible()) { stop(T('vid.asrInterrupted')); return; }
      const start = video.currentTime, rate = video.playbackRate, chunks = [];
      const current = new MediaRecorder(stream, {mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48000});
      recorder = current;
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      current.onerror = () => fail(new Error(T('vid.asrUnsupported')));
      current.onstop = () => {
        if (stopped) return;
        const duration = ((current.clipEnd ?? video.currentTime) - start) / rate;
        if (!current.discard && duration >= 0.5) {
          const blob = new Blob(chunks, {type: 'audio/webm'});
          if (duration > 25 || blob.size > 512 * 1024 || queue.length >= 2) { stop(T('vid.asrBacklog')); return; }
          queue.push({blob, start, duration, rate});
          void drain();
        }
        if (recorder === current) recorder = null;
        if (!finishing) { try { record(); } catch (error) { fail(error); } }
        else if (!busy && !queue.length) stop(T('vid.asrComplete'));
      };
      current.start();
      status('vid.asrRecording');
      timer = setTimeout(() => finishClip(), 20_000);
    }
    function listen(target, name, fn) { target.addEventListener(name, fn); listeners.push([target, name, fn]); }
    try {
      const captured = video.captureStream();
      for (const track of captured.getVideoTracks()) track.stop();
      stream = new MediaStream(captured.getAudioTracks());
      if (!stream.getAudioTracks().some(track => track.readyState === 'live')) throw new Error(T('vid.asrNoAudio'));
      listen(video, 'playing', () => { buffering = false; try { record(); } catch (error) { fail(error); } });
      listen(video, 'pause', () => { finishClip(); status('vid.asrPaused'); });
      listen(video, 'waiting', () => { buffering = true; finishClip(); });
      listen(video, 'ended', () => { finishing = true; finishClip(); if (!recorder && !busy && !queue.length) stop(T('vid.asrComplete')); });
      for (const name of ['seeking', 'ratechange', 'emptied', 'error']) listen(video, name, () => stop(T('vid.asrInterrupted')));
      listen(document, 'visibilitychange', () => { if (document.hidden) stop(T('vid.asrInterrupted')); });
      listen(window, 'pagehide', () => stop());
      watchdog = setInterval(() => { if (!video.isConnected || !eligible()) stop(T('vid.asrInterrupted')); }, 500);
      record();
      if (video.paused) status('vid.asrPaused');
    } catch (error) { stop(); throw error; }
    return {stop};
  }
  globalThis.RoamCatVideoDictation = {create};
})();
