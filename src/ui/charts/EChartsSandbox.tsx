import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { sanitizeChartConfig, SanitizeResult } from './sanitizer';
import { colors } from '../theme';

interface EChartsSandboxProps {
  config: Record<string, unknown>;
  height?: number;
  onError?: (error: string) => void;
}

let cachedEChartsJS: string | null = null;

async function loadEChartsBundle(): Promise<string> {
  if (cachedEChartsJS) return cachedEChartsJS;

  try {
    const asset = Asset.fromModule(
      require('../../../assets/charts/echarts.min.js.bundle')
    );
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('Asset localUri is null');

    const response = await fetch(asset.localUri);
    cachedEChartsJS = await response.text();

    if (!cachedEChartsJS || cachedEChartsJS.length < 1000) {
      throw new Error('ECharts bundle too small, likely invalid');
    }
    return cachedEChartsJS;
  } catch {
    cachedEChartsJS = '';
    throw new Error('Failed to load ECharts bundle');
  }
}

function buildHTMLTemplate(echartsJS: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
#chart { width: 100%; height: 100%; }
.error-box { display: flex; align-items: center; justify-content: center; height: 100%; color: ${colors.textMuted}; font-family: sans-serif; font-size: 13px; }
</style>
</head>
<body>
<div id="chart"></div>
<script>
${echartsJS}
</script>
<script>
(function() {
  'use strict';

  var resizeHandler = null;

  function reportError(msg) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: msg }));
    } catch(e) {}
  }

  function clearResizeHandler() {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
  }

  function renderChart(configStr) {
    var container = document.getElementById('chart');
    if (!container) { reportError('Container not found'); return; }

    if (!window.echarts) { reportError('ECharts not loaded'); return; }

    clearResizeHandler();

    var existing = window.echarts.getInstanceByDom(container);
    if (existing) existing.dispose();

    try {
      var config = JSON.parse(configStr);
    } catch(e) {
      reportError('JSON parse error: ' + e.message);
      return;
    }

    try {
      var chart = window.echarts.init(container, null, {
        renderer: 'canvas',
        width: 'auto',
        height: 'auto',
      });

      chart.setOption(config);

      resizeHandler = function() {
        if (chart && !chart.isDisposed()) chart.resize();
      };
      window.addEventListener('resize', resizeHandler);
    } catch(e) {
      clearResizeHandler();
      reportError('ECharts error: ' + e.message);
      container.innerHTML = '<div class="error-box">图表渲染失败</div>';
    }
  }

  window.renderChart = renderChart;
})();
</script>
</body>
</html>`;
}

export default function EChartsSandbox({ config, height = 200, onError }: EChartsSandboxProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sanitizeResult, setSanitizeResult] = useState<SanitizeResult | null>(null);
  const webViewRef = useRef<WebView>(null);
  const configRef = useRef<string>('');

  useEffect(() => {
    const result = sanitizeChartConfig(config);
    setSanitizeResult(result);
    if (!result.valid) {
      setLoadError(result.error || 'Invalid config');
      onError?.(result.error || 'Invalid config');
      return;
    }
    setLoadError(null);
  }, [config, onError]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const js = await loadEChartsBundle();
        if (!cancelled) {
          setHtml(buildHTMLTemplate(js));
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load ECharts');
          onError?.(e instanceof Error ? e.message : 'Failed to load ECharts');
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [onError]);

  useEffect(() => {
    if (!html || !webViewRef.current || !sanitizeResult?.valid) return;

    const configStr = JSON.stringify(sanitizeResult.config);
    if (configStr === configRef.current) return;
    configRef.current = configStr;

    const escaped = configStr
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n');

    webViewRef.current.injectJavaScript(
      `try { renderChart('${escaped}'); true; } catch(e) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: e.message })); true; }`
    );
  }, [html, sanitizeResult]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'error' && data.message) {
        onError?.(data.message);
      }
    } catch {}
  };

  if (loadError) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{loadError}</Text>
      </View>
    );
  }

  if (!html) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={false}
        cacheEnabled={false}
        androidLayerType="hardware"
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={handleMessage}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          onError?.(`WebView error: ${nativeEvent.description}`);
        }}
        injectedJavaScriptBeforeContentLoaded={`
          (function() {
            var originalPostMessage = window.ReactNativeWebView?.postMessage;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage = function(msg) {
                try {
                  var parsed = JSON.parse(msg);
                  if (typeof parsed === 'object' && parsed.type === 'error') {
                    originalPostMessage.call(window.ReactNativeWebView, msg);
                  }
                } catch(e) {}
              };
            }
          })();
          true;
        `}
        webviewDebuggingEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  webview: {
    backgroundColor: 'transparent',
  },
  errorIcon: {
    fontSize: 24,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
});
