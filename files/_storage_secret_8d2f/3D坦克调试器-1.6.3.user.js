// ==UserScript==
// @name         3D坦克调试器
// @version      1.6.3
// @description  搜索添加参数进行调试
// @match        *://*.3dtank.com/play*
// @match        *://*.tankionline.com/play*
// @match        *://*.test-eu.tankionline.com/browser-public/index.html*
// @icon         https://tankionline.com/favicon.ico
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const _win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // --- 0. 样式定义 ---
    const M3_STYLES = `
        :root {
            --m3-primary: #bfd5ff;
            --m3-on-primary: #062e6f;
            --m3-primary-container: rgba(168, 199, 250, 0.2);

            --m3-secondary: #76FF33;
            --m3-on-secondary: #001926;
            --m3-secondary-container: rgba(118, 255, 51, 0.2);

            --m3-surface: rgba(0, 15, 25, 0.6);
            --m3-surface-container: rgba(0, 0, 0, 0.35);
            --m3-surface-container-high: rgba(255, 255, 255, 0.1);
            --m3-surface-container-highest: rgba(255, 255, 255, 0.15);

            --m3-on-surface: #e2e2e9;
            --m3-on-surface-variant: #c4c6d0;
            --m3-outline: #8e9099;
            --m3-error: #ff6666;
            --m3-error-container: rgba(255, 180, 171, 0.25);
            --m3-cyan: #00d4ff;
            --m3-purple: #d580ff;
        }

        #debug-root, #debug-root * {
            -webkit-tap-highlight-color: transparent !important;
            box-sizing: border-box; font-family: inherit;
        }

        #debug-root {
            font-family: inherit; z-index: 999999;
            position: fixed; top: 0; left: 0; width: 0; height: 0;
            font-size: 14px; color: var(--m3-on-surface); line-height: 1.5;
            text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        }

        .svg-icon { display: inline-block; vertical-align: middle; width: 24px; height: 24px; fill: currentColor; }

        #debug-toggle {
            position: fixed; top: 10px; left: 10px;
            background: var(--m3-surface-container-highest); color: var(--m3-primary);
            border: 1px solid rgba(168, 199, 250, 0.4);
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            width: 40px; height: 40px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; backdrop-filter: blur(15px);
            transition: all 0.15s cubic-bezier(0.2, 0, 0, 1);
            pointer-events: auto; outline: none; z-index: 1000002;
        }
        @media (hover: hover) and (pointer: fine) {
            #debug-toggle:hover { transform: scale(1.1); background: var(--m3-primary-container); border-color: var(--m3-primary); box-shadow: 0 0 15px rgba(168, 199, 250, 0.4); }
            .btn-icon:hover { background: rgba(255,255,255,0.15); color: var(--m3-on-surface); }
            .search-res-item:hover { background: var(--m3-surface-container-high); border-color: var(--m3-primary); }
            .pm-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.3); border-color: rgba(168, 199, 250, 0.4); }
            .m-action-btn:hover { background: var(--m3-surface-container-high); color: var(--m3-on-surface); }
            .m-action-btn.error:hover { background: var(--m3-error-container); color: var(--m3-error); }
            .m-btn-filled:hover { filter: brightness(1.15); }
            .m-btn-tonal:hover { filter: brightness(1.15); }
            .m-btn-text:hover { background: rgba(168, 199, 250, 0.08); }
            .card-title-clickable:hover { color: var(--m3-primary); }
            .custom-checkbox-wrapper:hover { background: rgba(168, 199, 250, 0.08); }
        }

        #debug-toggle:active { transform: scale(0.85) !important; background: var(--m3-primary) !important; color: var(--m3-on-primary) !important; filter: brightness(1.2); }

        #debug-panel {
            position: fixed; top: 10px; left: 60px;
            background: var(--m3-surface); border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 24px; width: min(420px, calc(100vw - 75px));
            display: flex; flex-direction: column; max-height: calc(100vh - 20px);
            box-shadow: 0 16px 48px rgba(0,0,0,0.6); backdrop-filter: blur(25px);
            opacity: 0; pointer-events: none;
            transform-origin: top left; transform: translateX(-15px) scale(0.95);
            transition: opacity 0.2s, transform 0.2s cubic-bezier(0.2, 0, 0, 1); z-index: 1000001;
        }
        @media (max-width: 600px) {
            #debug-panel { top: 60px; left: 10px; transform-origin: top left; transform: translateY(-15px) scale(0.95); }
        }
        #debug-panel.active { opacity: 1; pointer-events: auto; transform: translate(0) scale(1); }

        .panel-header { padding: 20px 20px 10px 20px; flex-shrink: 0; }
        .panel-content { padding: 0 20px 20px 20px; overflow-y: auto; flex-grow: 1; overscroll-behavior: contain; }
        .panel-content::-webkit-scrollbar { width: 4px; }
        .panel-content::-webkit-scrollbar-thumb { background: var(--m3-outline); border-radius: 3px; }

        .m3-switch {
            width: 48px; height: 28px; border-radius: 14px; position: relative; cursor: pointer;
            border: 2px solid var(--m3-outline); background: rgba(0,0,0,0.4);
            display: inline-flex; align-items: center; flex-shrink: 0; box-sizing: border-box;
            transition: background-color 0.2s, border-color 0.2s; margin-left: 8px;
        }
        .m3-switch.on { border-color: var(--m3-secondary); background: var(--m3-secondary); box-shadow: 0 0 10px rgba(118,255,51,0.3); }
        .m3-switch-thumb {
            width: 14px; height: 14px; border-radius: 50%; background: var(--m3-outline);
            position: absolute; left: 5px; transition: left 0.2s cubic-bezier(0.2, 0, 0, 1), background-color 0.2s, transform 0.2s;
        }
        .m3-switch.on .m3-switch-thumb { left: calc(100% - 19px); background: var(--m3-on-secondary); transform: scale(1.2); }
        .m3-switch:active .m3-switch-thumb { transform: scale(0.9); }

        .m3-profile-bar-container {
            display: flex; align-items: center; justify-content: space-between;
            background: var(--m3-surface-container); border-radius: 16px; padding: 6px 12px; margin-bottom: 12px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .m3-profile-info-area { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 6px; border-radius: 12px; cursor: pointer; transition: 0.2s; overflow: hidden; }
        .m3-profile-info-area:active { background: rgba(255,255,255,0.1); transform: scale(0.98); }

        .m3-profile-title { font-size: 14px; font-weight: 600; color: var(--m3-primary); display:flex; align-items:center; gap:6px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .m3-profile-sub { font-size: 11px; color: var(--m3-on-surface-variant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .search-container { display: flex; background: var(--m3-surface-container); border-radius: 100px; padding: 4px 12px; align-items: center; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1); transition: 0.2s; }
        .search-container:focus-within { border-color: var(--m3-primary); background: var(--m3-surface-container-high); }
        .search-input { background: transparent; border: none; color: var(--m3-on-surface); flex: 1; font-size: 14px; outline: none; padding: 8px 0; text-shadow: none; }

        .debug-card { background: var(--m3-surface-container); border-radius: 16px; padding: 14px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; border: 1px solid rgba(255,255,255,0.05); transition: 0.2s; }
        .debug-card.active-debug { background: rgba(118, 255, 51, 0.1); border: 1px solid rgba(118, 255, 51, 0.3); }

        .card-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .card-title { font-size: 14px; font-weight: 700; color: var(--m3-on-surface); }
        .card-title-clickable { cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:0.15s; color: var(--m3-on-surface); }
        .card-title-clickable:active { transform: scale(0.96); opacity: 0.8; }
        .card-sub { font-size: 11px; color: var(--m3-on-surface-variant); margin-top: 2px; }

        .card-controls { display: flex; gap: 6px; align-items: center; background: rgba(0,0,0,0.4); padding: 6px 10px; border-radius: 12px; }
        .card-input { background: transparent; border: none; border-bottom: 1px solid var(--m3-outline); color: var(--m3-cyan); padding: 4px; font-size: 14px; flex: 1; outline: none; font-weight: 600; transition: 0.2s; min-width: 0; text-shadow: none;}
        .card-input:focus { border-bottom-color: var(--m3-primary); }
        .orig-val-btn { font-size: 11px; color: var(--m3-on-surface-variant); padding: 4px 10px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(255,255,255,0.08); border-radius: 100px; transition: 0.15s; max-width: 120px; flex-shrink: 0; border: none; outline: none; }
        .orig-val-btn:active { background: var(--m3-primary-container); color: var(--m3-primary); transform: scale(0.95); }

        .btn-icon { background: transparent; border: none; cursor: pointer; padding: 6px; border-radius: 50%; color: var(--m3-on-surface-variant); display: flex; align-items: center; justify-content: center; transition: 0.1s; }
        .btn-icon:active { transform: scale(0.8); background: rgba(255,255,255,0.2); color: var(--m3-primary); }
        .btn-del { color: var(--m3-error); } .btn-del:active { background: var(--m3-error-container); color: var(--m3-error); }
        .btn-lock.is-locked { color: var(--m3-secondary); background: var(--m3-secondary-container); }

        .search-res-item { padding: 12px 16px; border-radius: 16px; margin-bottom: 6px; font-size: 13px; background: var(--m3-surface-container); border: 1px solid transparent; transition: 0.15s; }
        .search-res-item:active { background: var(--m3-surface-container-high); border-color: var(--m3-primary); transform: scale(0.97); }
        .hl-cls { color: var(--m3-purple); font-weight: 600; }

        .custom-checkbox-wrapper {
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            width: 40px; height: 40px; border-radius: 50%; /* 圆形触控范围 */
            margin-right: 4px; position: relative; flex-shrink: 0;
            color: var(--m3-outline); /* 默认颜色：未勾选 */
            transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .custom-checkbox-wrapper.checked { color: var(--m3-primary); /* 勾选后颜色 */ }

        /* 点击波纹 */
        .custom-checkbox-wrapper::after {
            content: ""; position: absolute; inset: 0; border-radius: 50%;
            background: currentColor; opacity: 0; transform: scale(0);
            transition: transform 0.2s, opacity 0.2s; pointer-events: none;
        }
        .custom-checkbox-wrapper:active::after { opacity: 0.12; transform: scale(1); transition: 0s; }

        /* 图标容器：Grid 布局强制居中重叠 */
        .cb-icon-box {
            display: grid; place-items: center; width: 24px; height: 24px; position: relative;
        }
        .cb-svg {
            grid-area: 1 / 1; width: 24px; height: 24px;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.1s linear;
        }

        /* 状态机：未勾选 (cb-off 显示, cb-on 隐藏) */
        .cb-off { opacity: 1; transform: scale(1); }
        .cb-on  { opacity: 0; transform: scale(0.5); }

        /* 状态机：已勾选 (cb-off 隐藏, cb-on 显示) */
        .custom-checkbox-wrapper.checked .cb-off { opacity: 0; transform: scale(0.6); }
        .custom-checkbox-wrapper.checked .cb-on  { opacity: 1; transform: scale(1); }

        .search-res-layout { display: flex; align-items: center; }
        .search-res-content {
            flex: 1;
            cursor: pointer;
            min-width: 0;
            white-space: normal; /* 允许文本换行 */
            word-break: break-all; /* 允许在单词/长字符串内部强制换行 */
            line-height: 1.5; /* 增加行高让多行显示更易读 */
            padding: 4px 0; /* 增加一点上下间距 */
        }

        .m3-mask { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(5px); z-index: 1000003; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: 0.3s; }
        .m3-mask.active { opacity: 1; pointer-events: auto; }
        .m3-modal { background: rgba(20, 30, 40, 0.85); width: 850px; max-width: 94%; max-height: 85vh; border-radius: 28px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 24px 48px rgba(0,0,0,0.8); display: flex; flex-direction: column; transform: scale(0.95) translateY(20px); transition: 0.3s cubic-bezier(0.2, 0, 0, 1); backdrop-filter: blur(25px); }
        .m3-mask.active .m3-modal { transform: scale(1) translateY(0); }

        .modal-header { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .modal-title { color: var(--m3-primary); font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .modal-subtitle { color: var(--m3-on-surface-variant); font-size: 12px; }
        .modal-header-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }

        .m-action-btn { background: transparent; border: none; padding: 8px; border-radius: 50%; cursor: pointer; color: var(--m3-on-surface-variant); display: flex; align-items: center; justify-content: center; transition: 0.1s; }
        .m-action-btn.active { background: var(--m3-primary-container); color: var(--m3-primary); box-shadow: inset 0 0 0 1px var(--m3-primary); }
        .m-action-btn:active { transform: scale(0.8); background: var(--m3-surface-container-high); color: var(--m3-primary); filter: brightness(1.3); }
        .m-action-btn.error:active { background: var(--m3-error-container); color: var(--m3-error); }

        .modal-body { flex: 1; overflow-y: auto; padding: 16px; background: transparent; font-size: 13px; border-radius: 0 0 28px 28px; }
        .modal-body::-webkit-scrollbar { width: 6px; }
        .modal-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }

        .modal-item { padding: 14px 16px; border-radius: 16px; margin-bottom: 12px; background: rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 10px; line-height: 1.5; border: 1px solid rgba(255,255,255,0.05); }
        .modal-item-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px; }
        .val-index { color: var(--m3-outline); font-weight: bold; font-size: 14px; }
        .val-actions { display: flex; gap: 8px; }
        .val-content { white-space: pre-wrap; word-break: break-all; overflow-x: auto; }

        .jv-key { color: var(--m3-on-surface-variant); }
        .jv-string { color: #a5d6ff; } .jv-number { color: var(--m3-secondary); }
        .jv-boolean { color: var(--m3-purple); } .jv-null { color: var(--m3-error); }
        .jv-obj { color: #ffee00; }

        .pm-card { background: var(--m3-surface-container); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; transition: 0.2s; gap: 12px; cursor: pointer; }
        .pm-card:active { background: var(--m3-surface-container-high); transform: scale(0.97); border-color: var(--m3-primary); }

        .m-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: none; padding: 10px 20px; border-radius: 100px; cursor: pointer; font-size: 14px; font-weight: 600; transition: 0.15s cubic-bezier(0.2, 0, 0, 1); background: transparent; }
        .m-btn:active { transform: scale(0.9); filter: brightness(1.2); }
        .m-btn-filled { background: var(--m3-primary); color: var(--m3-on-primary); }
        .m-btn-tonal { background: var(--m3-primary-container); color: var(--m3-primary); }
        .m-btn-text { color: var(--m3-primary); }
        .m-btn-text:active { background: var(--m3-primary-container); }

        #m3-sys-dialog { z-index: 1000005; }
        .m3-sys-surface { background: rgba(20, 30, 40, 0.95); border-radius: 28px; width: min(440px, 90vw); padding: 24px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 24px 48px rgba(0,0,0,0.8); transform: scale(0.9); transition: 0.3s cubic-bezier(0.2, 0, 0, 1); backdrop-filter: blur(25px); }
        #m3-sys-dialog.active .m3-sys-surface { transform: scale(1); }
        .sys-headline { font-size: 20px; font-weight: 600; color: var(--m3-on-surface); margin-bottom: 16px; }
        .sys-text { font-size: 14px; color: var(--m3-on-surface-variant); margin-bottom: 24px; white-space: pre-wrap; line-height: 1.6; }
        .sys-inputs { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
        .sys-input-field { background: rgba(0,0,0,0.4); border: 1px solid var(--m3-outline); border-radius: 12px; padding: 14px 16px; color: var(--m3-on-surface); outline: none; font-size: 14px; transition: 0.2s; text-shadow: none; }
        .sys-input-field:focus { border-color: var(--m3-primary); background: rgba(0,0,0,0.6); box-shadow: inset 0 0 0 1px var(--m3-primary); }
        .sys-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
        .sys-actions::-webkit-scrollbar { height: 0; }
    `;

    // --- 1. 核心引擎 ---
    _win.TankiDebug = {
        config: { profiles:[], currentProfileId: null },
        runtimeDebugs: {},
        storageKey: 'tanki_debug_config_v5',
        isScanning: false,
        cachedScanResults: null,
        currentModalKey: null,
        hideDuplicates: false,
        _currentDialogId: 0,
        searchTimeout: null,

        // 搜索状态管理
        currentSearchResults:[],
        selectedSearchResults: new Set(),

        getIcon: function(name, cls = '', style = '') {
            const paths = {
                search: 'M380-320q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l224 224q11 11 11 28t-11 28q-11 11-28 11t-28-11L532-372q-30 24-69 38t-83 14Zm0-80q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
                lock_open: 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h360v-80q0-50-35-85t-85-35q-42 0-73.5 25.5T364-751q-4 14-16.5 22.5T320-720q-17 0-28.5-11t-8.5-26q14-69 69-116t128-47q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm296.5-143.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM240-160v-400 400Z',
                lock: 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm296.5-143.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z',
                delete: 'M280-120q-33 0-56.5-23.5T200-200v-520q-17 0-28.5-11.5T160-760q0-17 11.5-28.5T200-800h160q0-17 11.5-28.5T400-840h160q17 0 28.5 11.5T600-800h160q17 0 28.5 11.5T800-760q0 17-11.5 28.5T760-720v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM428.5-291.5Q440-303 440-320v-280q0-17-11.5-28.5T400-640q-17 0-28.5 11.5T360-600v280q0 17 11.5 28.5T400-280q17 0 28.5-11.5Zm160 0Q600-303 600-320v-280q0-17-11.5-28.5T560-640q-17 0-28.5 11.5T520-600v280q0 17 11.5 28.5T560-280q17 0 28.5-11.5ZM280-720v520-520Z',
                close: 'M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z',
                tune: 'M451.5-131.5Q440-143 440-160v-160q0-17 11.5-28.5T480-360q17 0 28.5 11.5T520-320v40h280q17 0 28.5 11.5T840-240q0 17-11.5 28.5T800-200H520v40q0 17-11.5 28.5T480-120q-17 0-28.5-11.5ZM160-200q-17 0-28.5-11.5T120-240q0-17 11.5-28.5T160-280h160q17 0 28.5 11.5T360-240q0 17-11.5 28.5T320-200H160Zm131.5-171.5Q280-383 280-400v-40H160q-17 0-28.5-11.5T120-480q0-17 11.5-28.5T160-520h120v-40q0-17 11.5-28.5T320-600q17 0 28.5 11.5T360-560v160q0 17-11.5 28.5T320-360q-17 0-28.5-11.5ZM480-440q-17 0-28.5-11.5T440-480q0-17 11.5-28.5T480-520h320q17 0 28.5 11.5T840-480q0 17-11.5 28.5T800-440H480Zm131.5-171.5Q600-623 600-640v-160q0-17 11.5-28.5T640-840q17 0 28.5 11.5T680-800v40h120q17 0 28.5 11.5T840-720q0 17-11.5 28.5T800-680H680v40q0 17-11.5 28.5T640-600q-17 0-28.5-11.5ZM160-680q-17 0-28.5-11.5T120-720q0-17 11.5-28.5T160-760h320q17 0 28.5 11.5T520-720q0 17-11.5 28.5T480-680H160Z',
                file_add: 'M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h287q16 0 30.5 6t25.5 17l194 194q11 11 17 25.5t6 30.5v167q0 17-11.5 28.5T760-400q-17 0-28.5-11.5T720-440v-160H560q-17 0-28.5-11.5T520-640v-160H240v640h320q17 0 28.5 11.5T600-120q0 17-11.5 28.5T560-80H240Zm520-103v49q0 17-11.5 28.5T720-94q-17 0-28.5-11.5T680-134v-146q0-17 11.5-28.5T720-320h146q17 0 28.5 11.5T906-280q0 17-11.5 28.5T866-240h-50l90 90q11 11 11 27.5T906-94q-12 12-28.5 12T849-94l-89-89Zm-520 23v-640 640Z',
                file_export: 'M480-480ZM320-183l-90 90q-12 12-28 11.5T174-94q-11-12-11.5-28t11.5-28l90-90h-50q-17 0-28.5-11.5T174-280q0-17 11.5-28.5T214-320h146q17 0 28.5 11.5T400-280v146q0 17-11.5 28.5T360-94q-17 0-28.5-11.5T320-134v-49ZM171.5-411.5Q160-423 160-440v-360q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H520q-17 0-28.5-11.5T480-120q0-17 11.5-28.5T520-160h200v-440H560q-17 0-28.5-11.5T520-640v-160H240v360q0 17-11.5 28.5T200-400q-17 0-28.5-11.5Z',
                filter: 'M440-160q-17 0-28.5-11.5T400-200v-240L168-736q-15-20-4.5-42t36.5-22h560q26 0 36.5 22t-4.5 42L560-440v240q0 17-11.5 28.5T520-160h-80Zm40-308 198-252H282l198 252Zm0 0Z',
                import: 'M465-339.5q-7-2.5-13-8.5L308-492q-12-12-11.5-28t11.5-28q12-12 28.5-12.5T365-549l75 75v-286q0-17 11.5-28.5T480-800q17 0 28.5 11.5T520-760v286l75-75q12-12 28.5-11.5T652-548q11 12 11.5 28T652-492L508-348q-6 6-13 8.5t-15 2.5q-8 0-15-2.5ZM240-160q-33 0-56.5-23.5T160-240v-80q0-17 11.5-28.5T200-360q17 0 28.5 11.5T240-320v80h480v-80q0-17 11.5-28.5T760-360q17 0 28.5 11.5T800-320v80q0 33-23.5 56.5T720-160H240Z',
                add: 'M440-440H240q-17 0-28.5-11.5T200-480q0-17 11.5-28.5T240-520h200v-200q0-17 11.5-28.5T480-760q17 0 28.5 11.5T520-720v200h200q17 0 28.5 11.5T760-480q0 17-11.5 28.5T720-440H520v200q0 17-11.5 28.5T480-200q-17 0-28.5-11.5T440-240v-200Z',
                clipboard: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h167q11-35 43-57.5t70-22.5q40 0 71.5 22.5T594-840h166q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560h-80v80q0 17-11.5 28.5T640-640H320q-17 0-28.5-11.5T280-680v-80h-80v560Zm308.5-571.5Q520-783 520-800t-11.5-28.5Q497-840 480-840t-28.5 11.5Q440-817 440-800t11.5 28.5Q463-760 480-760t28.5-11.5Z',
                copy: 'M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-520q0-17 11.5-28.5T160-720q17 0 28.5 11.5T200-680v520h400q17 0 28.5 11.5T640-120q0 17-11.5 28.5T600-80H200Zm160-240v-480 480Z',
                export: 'M240-160q-33 0-56.5-23.5T160-240v-80q0-17 11.5-28.5T200-360q17 0 28.5 11.5T240-320v80h480v-80q0-17 11.5-28.5T760-360q17 0 28.5 11.5T800-320v80q0 33-23.5 56.5T720-160H240Zm200-486-75 75q-12 12-28.5 11.5T308-572q-11-12-11.5-28t11.5-28l144-144q6-6 13-8.5t15-2.5q8 0 15 2.5t13 8.5l144 144q12 12 11.5 28T652-572q-12 12-28.5 12.5T595-571l-75-75v286q0 17-11.5 28.5T480-320q-17 0-28.5-11.5T440-360v-286Z',
                perm_media: 'M120-120q-33 0-56.5-23.5T40-200v-480q0-17 11.5-28.5T80-720q17 0 28.5 11.5T120-680v480h640q17 0 28.5 11.5T800-160q0 17-11.5 28.5T760-120H120Zm160-160q-33 0-56.5-23.5T200-360v-440q0-33 23.5-56.5T280-880h167q16 0 30.5 6t25.5 17l57 57h280q33 0 56.5 23.5T920-720v360q0 33-23.5 56.5T840-280H280Zm0-80h560v-360H527l-80-80H280v440Zm0 0v-440 440Zm250-140-46-60q-6-8-16-8t-16 8l-67 88q-8 10-2.5 21t18.5 11h318q13 0 18.5-11t-2.5-21l-97-127q-6-8-16-8t-16 8l-76 99Z',
                edit: 'M200-200h57l391-391-57-57-391 391v57Zm-40 80q-17 0-28.5-11.5T120-160v-97q0-16 6-30.5t17-25.5l505-504q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L313-143q-11 11-25.5 17t-30.5 6h-97Zm600-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z',
                download: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
                // 空心圆环 (标准的 radio_button_unchecked)
                checkbox_unchecked: 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
                // 实心圆 + 精准提取的原版对勾镂空
                checkbox_checked: 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80ZM424-408l-86-86q-11-11-28-11t-28 11q-11 11-11 28t11 28l114 114q12 12 28 12t28-12l226-226q11-11 11-28t-11-28q-11-11-28-11t-28 11L424-408Z" fill-rule="evenodd'
            };
            return `<svg xmlns="http://www.w3.org/2000/svg" class="svg-icon ${cls}" style="${style}" viewBox="0 -960 960 960"><path fill="currentColor" d="${paths[name] || ''}"/></svg>`;
        },

        generateId: () => Math.random().toString(36).substr(2, 9),

        init: function() {
            let saved = null;
            try { saved = GM_getValue(this.storageKey); } catch (e) {}
            if (!saved) { try { saved = localStorage.getItem(this.storageKey); } catch (e) {} }

            if (!saved) {
                let old = null;
                try { old = GM_getValue('tanki_debug_targets_v4'); } catch(e){}
                if (!old) { try { old = localStorage.getItem('tanki_debug_targets_v4'); } catch(e){} }
                if (old) {
                    try {
                        let parsedOld = JSON.parse(old);
                        this.config = { profiles:[{ id: this.generateId(), name: "默认设定", author: "匿名", enabled: true, targets: parsedOld }], currentProfileId: null };
                        saved = true;
                    } catch(e){}
                }
            } else { try { this.config = JSON.parse(saved); } catch (e) {} }

            if (!this.config || !this.config.profiles || this.config.profiles.length === 0) {
                this.config = { profiles:[{ id: this.generateId(), name: "默认设定", author: "匿名", enabled: true, targets: {} }], currentProfileId: null };
            }

            if (!this.config.currentProfileId || !this.config.profiles.find(p => p.id === this.config.currentProfileId)) {
                this.config.currentProfileId = this.config.profiles[0].id;
            }

            if (document.readyState === 'complete') this.runAutoScan();
            else window.addEventListener('load', () => this.runAutoScan());

            this.startUIRefreshLoop();
        },

        sysDialog: function(title, content, inputs = [], actions =[]) {
            const currentDialogId = Date.now();
            this._currentDialogId = currentDialogId;

            document.getElementById('sys-dialog-title').innerText = title;
            document.getElementById('sys-dialog-content').innerText = content;
            document.getElementById('sys-dialog-content').style.display = content ? 'block' : 'none';

            const inpsContainer = document.getElementById('sys-dialog-inputs');
            if (inputs.length > 0) {
                inpsContainer.style.display = 'flex';
                inpsContainer.innerHTML = inputs.map(i => `<input type="text" class="sys-input-field" id="sys-inp-${i.id}" placeholder="${this.escapeHtml(i.placeholder || i.label)}" value="${this.escapeHtml(i.value || '')}">`).join('');
            } else {
                inpsContainer.style.display = 'none';
                inpsContainer.innerHTML = '';
            }

            const actsContainer = document.getElementById('sys-dialog-actions');
            actsContainer.innerHTML = '';
            actions.forEach(act => {
                const btn = document.createElement('button');
                btn.className = `m-btn ${act.type || 'm-btn-text'}`;
                btn.innerHTML = (act.icon ? this.getIcon(act.icon, '', 'width:18px;height:18px;') : '') + act.text;

                btn.onclick = async () => {
                    let vals = {};
                    inputs.forEach(i => { vals[i.id] = document.getElementById(`sys-inp-${i.id}`).value; });
                    if (act.onClick) {
                        let res = act.onClick(vals);
                        if (res instanceof Promise) await res;
                        if (res === false) return;
                    }
                    setTimeout(() => {
                        if (this._currentDialogId === currentDialogId) {
                            document.getElementById('m3-sys-dialog').classList.remove('active');
                        }
                    }, 150);
                };
                actsContainer.appendChild(btn);
            });
            document.getElementById('m3-sys-dialog').classList.add('active');

            if (inputs.length > 0) { setTimeout(() => { document.getElementById(`sys-inp-${inputs[0].id}`).focus(); }, 100); }
        },

        showAlert: function(msg) {
            this.sysDialog('系统提示', msg,[],[{text: '确定', type: 'm-btn-filled'}]);
        },

        showConfirm: function(msg, onYes) {
            this.sysDialog('确认操作', msg, [],[
                {text: '取消', type: 'm-btn-text'},
                {text: '确定', type: 'm-btn-filled', onClick: onYes}
            ]);
        },

        copyText: function(text, msg) {
            const fallback = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    this.showAlert(msg || "已成功复制！");
                } catch(e) {
                    this.showAlert("复制失败，请尝试手动复制。");
                }
            };
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => this.showAlert(msg || "已成功复制！")).catch(fallback);
            } else {
                fallback();
            }
        },

        getCurrentProfile: function() { return this.config.profiles.find(p => p.id === this.config.currentProfileId) || this.config.profiles[0]; },

        getMergedTargets: function() {
            let merged = {};
            this.config.profiles.filter(p => p.enabled).forEach(p => {
                Object.keys(p.targets).forEach(k => { merged[k] = { ...p.targets[k], profileId: p.id }; });
            });
            return merged;
        },

        deepInspect: function(obj, depth = 0, maxDepth = 5, seen = new WeakSet(), maxKeys = 50) {
            if (obj === null) return '<span class="jv-null">null</span>';
            if (obj === undefined) return '<span class="jv-null">undefined</span>';
            if (typeof obj === 'number') return `<span class="jv-number">${Number.isInteger(obj) ? obj : obj.toFixed(4)}</span>`;
            if (typeof obj === 'boolean') return `<span class="jv-boolean">${obj}</span>`;
            if (typeof obj === 'string') {
                let safeStr = obj.length > 2000 ? obj.substring(0, 2000) + '...[字符串过长已截断]' : obj;
                return `<span class="jv-string">"${this.escapeHtml(safeStr)}"</span>`;
            }
            if (typeof obj === 'bigint') return `<span class="jv-number">${obj}n</span>`;
            if (typeof obj === 'function') return `<span class="jv-obj">f ${obj.name || '()'}</span>`;
            if (typeof obj === 'symbol') return `<span class="jv-obj">${obj.toString()}</span>`;

            if (typeof obj === 'object') {
                if (seen.has(obj)) return '<span class="jv-null">[Circular]</span>';
                if (typeof Element !== 'undefined' && obj instanceof Element) return `<span class="jv-obj">&lt;${obj.tagName.toLowerCase()}&gt;</span>`;

                if (typeof ImageBitmap !== 'undefined' && obj instanceof ImageBitmap) return `<span class="jv-obj">ImageBitmap(${obj.width}x${obj.height})</span>`;
                if (typeof ImageData !== 'undefined' && obj instanceof ImageData) return `<span class="jv-obj">ImageData(${obj.width}x${obj.height})</span>`;
                if (typeof AudioBuffer !== 'undefined' && obj instanceof AudioBuffer) return `<span class="jv-obj">AudioBuffer(${obj.duration.toFixed(2)}s)</span>`;
                if (typeof Blob !== 'undefined' && obj instanceof Blob) return `<span class="jv-obj">Blob(${obj.type || 'unknown'}, ${obj.size} bytes)</span>`;

                let className = ''; try { if (obj.constructor && obj.constructor.name && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array') className = obj.constructor.name; } catch(e) {}
                if (depth >= maxDepth) {
                    if (Array.isArray(obj) || (ArrayBuffer.isView(obj) && !(obj instanceof DataView))) return `<span class="jv-obj">[Array(${obj.length})]</span>`;
                    return `<span class="jv-obj">${className ? className + ' {...}' : '{...}'}</span>`;
                }
                seen.add(obj); let result = '';
                try {
                    const isTypedArray = ArrayBuffer.isView(obj) && !(obj instanceof DataView);
                    if (Array.isArray(obj) || isTypedArray) {
                        if (obj.length === 0) result = isTypedArray ? `${className}[]` : '[]';
                        else {
                            const items =[];
                            const len = Math.min(obj.length, maxKeys);
                            for (let i = 0; i < len; i++) items.push(this.deepInspect(obj[i], depth + 1, maxDepth, seen, maxKeys));
                            if (obj.length > maxKeys) items.push(`<span class="jv-obj">... ${obj.length - maxKeys} more</span>`);
                            result = isTypedArray ? `${className}(${obj.length}) [${items.join(', ')}]` : `[${items.join(', ')}]`;
                        }
                    } else {
                        const allKeys = Array.from(new Set([...Object.keys(obj), ...Object.getOwnPropertyNames(obj)])).filter(p => p !== 'constructor' && p !== '__proto__');
                        if (allKeys.length === 0) {
                            const str = String(obj);
                            if (str !== '[object Object]') result = `<span class="jv-obj">${str}</span>`;
                            else result = className ? `${className} {}` : '{}';
                        } else {
                            const parts =[]; let i = 0;
                            for (const key of allKeys) {
                                if (i++ >= maxKeys) { parts.push(`<span class="jv-obj">... ${allKeys.length - maxKeys} more</span>`); break; }
                                let val; try { val = obj[key]; } catch (e) { val = '[Error]'; }
                                parts.push(`<span class="jv-key">${key}</span>: ${this.deepInspect(val, depth + 1, maxDepth, seen, maxKeys)}`);
                            }
                            result = `${className ? className + ' ' : ''}{ ${parts.join(', ')} }`;
                        }
                    }
                } catch (e) { result = `[Error]`; }
                seen.delete(obj); return result;
            }
            return String(obj);
        },

        serializeValue: function(val) {
            if (val === undefined) return "undefined";
            if (val === null) return "null";
            if (typeof val === 'function') return val.toString();
            if (typeof val === 'symbol') return val.toString();
            if (typeof val === 'bigint') return val.toString() + "n";
            if (typeof val === 'object') {
                if (typeof Element !== 'undefined' && val instanceof Element) return `<${val.tagName.toLowerCase()}>`;
                try {
                    const cache = new Set();
                    return JSON.stringify(val, (key, value) => {
                        if (typeof value === 'object' && value !== null) {
                            if (cache.has(value)) return "[Circular]";
                            if (typeof Element !== 'undefined' && value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
                            cache.add(value);
                        }
                        if (typeof value === 'bigint') return value.toString() + "n";
                        if (typeof value === 'function') return value.name ? `[Function: ${value.name}]` : '[Function]';
                        if (typeof value === 'symbol') return value.toString();
                        return value;
                    }, 2);
                } catch(e) {
                    return String(val);
                }
            }
            return String(val);
        },

        simpleFormat: function(v) {
            if (v === null) return 'null'; if (v === undefined) return 'undefined';
            if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
            if (typeof v === 'boolean') return String(v);
            if (typeof v === 'string') return v.length > 20 ? `"${v.substring(0, 17)}..."` : `"${v}"`;
            if (typeof v === 'object') {
                if (Array.isArray(v)) return `Array(${v.length})`;
                if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return `${v.constructor.name}(${v.length})`;
                let className = ''; try { if (v.constructor && v.constructor.name !== 'Object') className = v.constructor.name; } catch(e){}
                return className ? `${className} {...}` : '{...}';
            }
            return String(v);
        },

        saveConfig: function() {
            const str = JSON.stringify(this.config);
            try { GM_setValue(this.storageKey, str); } catch (e) {}
            try { localStorage.setItem(this.storageKey, str); } catch (e) {}
        },

        fetchAndParseScripts: async function(force = false) {
            if (this.cachedScanResults && !force) return this.cachedScanResults;
            let codes =[];
            document.querySelectorAll('script:not([src])').forEach(s => codes.push(s.innerHTML));
            let scriptTags = document.querySelectorAll('script[src]');
            for(let s of scriptTags) {
                if(s.src.includes('analytics') || s.src.includes('google')) continue;
                try {
                    const resp = await fetch(s.src);
                    if(resp.ok) codes.push(await resp.text());
                } catch(e){}
            }

            let results =[];
            let resultSet = new Set();

            codes.forEach(code => {
                let classes = [];
                let getters =[];

                const toStringRegex = /\.toString\s*=\s*function\(\)\s*\{([\s\S]{1,3000}?)\}/g;
                let tsMatch;
                while ((tsMatch = toStringRegex.exec(code)) !== null) {
                    let funcBody = tsMatch[1];
                    let clsMatch = funcBody.match(/["']([A-Za-z0-9_$]+)\s*(?:\[|\()/);
                    if (!clsMatch) continue;
                    let cls = clsMatch[1];

                    let params =[];
                    const paramRegex = /["']([a-zA-Z0-9_$]+)\s*=\s*["']\s*\+\s*(?:[a-zA-Z0-9_$]+\()?this\.([a-zA-Z0-9_$]+)(\()?/g;
                    let pMatch;
                    while ((pMatch = paramRegex.exec(funcBody)) !== null) {
                        params.push({ pName: pMatch[1], obf: pMatch[2], isGetter: !!pMatch[3] });
                    }
                    classes.push({ cls, index: tsMatch.index, params });
                }

                const getterRegex = /\.([A-Za-z0-9_$]+)\s*=\s*function\(\)\s*\{([^}]*?this\.([A-Za-z0-9_$]+)[^}]*?)\}/g;
                let gm;
                while ((gm = getterRegex.exec(code)) !== null) {
                    let gName = gm[1];
                    let gBody = gm[2];

                    let varName = null;
                    let vMatch1 = gBody.match(/var\s+[A-Za-z0-9_$]+\s*=\s*this\.([A-Za-z0-9_$]+)/);
                    if (vMatch1) varName = vMatch1[1];
                    else {
                        let vMatch2 = gBody.match(/return\s+this\.([A-Za-z0-9_$]+)/);
                        if (vMatch2) varName = vMatch2[1];
                    }

                    if (varName) {
                        let propMatch = gBody.match(/["']([a-zA-Z0-9_$]{4,})["']/);
                        let propName = propMatch ? propMatch[1] : null;
                        getters.push({ gName, varName, propName, index: gm.index });
                    }
                }

                const resolveGetter = (obfName, pName, classIndex) => {
                    let matching = getters.filter(g => g.gName === obfName);
                    if (matching.length === 0) return null;
                    matching.sort((a, b) => Math.abs(a.index - classIndex) - Math.abs(b.index - classIndex));
                    let exactMatch = matching.find(g => g.propName === pName);
                    return exactMatch ? exactMatch.varName : matching[0].varName;
                };

                for (let c of classes) {
                    for (let p of c.params) {
                        let finalObf = p.obf;
                        if (p.isGetter) {
                            let resolved = resolveGetter(p.obf, p.pName, c.index);
                            if (resolved) finalObf = resolved;
                            else continue;
                        }

                        if (finalObf && typeof finalObf === 'string' && !finalObf.startsWith('__hk_')) {
                            let key = `${c.cls}.${p.pName}.${finalObf}`;
                            if (!resultSet.has(key)) {
                                results.push({ cls: c.cls, pName: p.pName, obf: finalObf });
                                resultSet.add(key);
                            }
                        }
                    }
                }

                const classRegex1 = /return\s*["']([A-Za-z0-9_$]+)\(([\s\S]*?)\)["']/g;
                let match1;
                while ((match1 = classRegex1.exec(code)) !== null) {
                    let cls = match1[1];
                    let paramsStr = match1[2];
                    let classIndex = match1.index;

                    const paramRegex = /([a-zA-Z0-9_$]+)\s*=\s*["']?\s*\+\s*(?:[a-zA-Z0-9_$]+\()?this\.([a-zA-Z0-9_$]+)(\()?/g;
                    let pMatch;
                    while ((pMatch = paramRegex.exec(paramsStr)) !== null) {
                        let pName = pMatch[1];
                        let obf = pMatch[2];
                        let isGetter = !!pMatch[3];

                        let finalObf = obf;
                        if (isGetter) {
                            let resolved = resolveGetter(obf, pName, classIndex);
                            if (resolved) finalObf = resolved;
                            else continue;
                        }

                        if (finalObf && typeof finalObf === 'string' && !finalObf.startsWith('__hk_')) {
                            let key = `${cls}.${pName}.${finalObf}`;
                            if (!resultSet.has(key)) {
                                results.push({ cls, pName, obf: finalObf });
                                resultSet.add(key);
                            }
                        }
                    }
                }

                for (let g of getters) {
                    if (g.propName && g.propName.length > 3) {
                        let closestClass = null;
                        let minDistance = Infinity;
                        for (let c of classes) {
                            let dist = Math.abs(c.index - g.index);
                            if (dist < 15000 && dist < minDistance) {
                                minDistance = dist;
                                closestClass = c.cls;
                            }
                        }
                        if (closestClass) {
                            let key = `${closestClass}.${g.propName}.${g.varName}`;
                            if (!resultSet.has(key)) {
                                results.push({ cls: closestClass, pName: g.propName, obf: g.varName });
                                resultSet.add(key);
                            }
                        }
                    }
                }
            });
            this.cachedScanResults = results;
            return results;
        },

        runAutoScan: async function() {
            let allTargetKeys = new Set();
            this.config.profiles.forEach(p => { Object.keys(p.targets).forEach(k => allTargetKeys.add(k)); });
            if (allTargetKeys.size === 0) return;

            this.isScanning = true; this.renderList();
            try {
                const allMappings = await this.fetchAndParseScripts();
                allMappings.forEach(r => {
                    const targetKey = `${r.cls}.${r.pName}`;
                    if (allTargetKeys.has(targetKey) && !this.runtimeDebugs[r.obf]) {
                        this.runtimeDebugs[r.obf] = { key: targetKey, origVal: undefined, origValues:[] };
                        this.applyHook(r.obf);
                    }
                });
            } catch(e) {
                console.error("AutoScan Failed:", e);
            }
            this.isScanning = false; this.renderList();
        },

        handleSearchInput: function(el) {
            document.getElementById('btn-clear-search').style.display = el.value ? 'inline-flex' : 'none';
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.search();
            }, 300);
        },

        search: async function() {
            const query = document.getElementById('debug-search-input').value.trim().toLowerCase();
            const resArea = document.getElementById('search-res-area');
            const clearBtn = document.getElementById('btn-clear-search');
            clearBtn.style.display = query ? 'inline-flex' : 'none';
            if (!query) { this.clearSearch(); return; }
            resArea.innerHTML = '<div style="padding:16px; text-align:center; color:var(--m3-cyan);">搜索中...</div>';

            try {
                const mappings = await this.fetchAndParseScripts();
                const keywords = query.split(/\s+/).filter(k => k);
                const results = mappings.filter(r => {
                    const fullStr = `${r.cls}.${r.pName}`.toLowerCase();
                    return keywords.every(kw => fullStr.includes(kw));
                });

                this.currentSearchResults = results;
                this.selectedSearchResults = new Set();

                if (results.length === 0) {
                    resArea.innerHTML = '<div style="padding:16px; text-align:center; color:var(--m3-on-surface-variant);">未找到匹配的参数</div>';
                } else {
                    let html = `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 16px 8px;">
                            <span style="font-size:12px; color:var(--m3-primary)">找到 ${results.length} 个结果</span>
                            <div style="display:flex; gap:6px; flex-wrap: wrap; justify-content: flex-end;">
                                <button class="orig-val-btn" style="padding:4px 10px; display:flex; align-items:center; gap:4px;" onclick="window.TankiDebug.addSelectedSearch()">
                                    ${_win.TankiDebug.getIcon('add', '', 'width:14px;height:14px;')} 添加选中
                                </button>
                                <button class="orig-val-btn" style="padding:4px 10px; display:flex; align-items:center; gap:4px;" onclick="window.TankiDebug.addAllSearch()">
                                    ${_win.TankiDebug.getIcon('add', '', 'width:14px;height:14px;')} 全部添加
                                </button>
                                <button class="orig-val-btn" style="padding:4px 10px; display:flex; align-items:center; gap:4px;" onclick="window.TankiDebug.copySelectedSearch()">
                                    ${_win.TankiDebug.getIcon('copy', '', 'width:14px;height:14px;')} 复制选中
                                </button>
                                <button class="orig-val-btn" style="padding:4px 10px; display:flex; align-items:center; gap:4px;" onclick="window.TankiDebug.copyAllSearch()">
                                    ${_win.TankiDebug.getIcon('copy', '', 'width:14px;height:14px;')} 全部复制
                                </button>
                            </div>
                        </div>`;

                    const limit = 200;
                    const displayResults = results.slice(0, limit);

                    displayResults.forEach(r => {
                        const key = `${r.cls}.${r.pName}`;
                        html += `
                        <div class="search-res-item search-res-layout">
                            <div class="custom-checkbox-wrapper" onclick="window.TankiDebug.toggleSearchSelect('${key}', this, event)">
                                <div class="cb-icon-box">
                                    ${_win.TankiDebug.getIcon('checkbox_unchecked', 'cb-svg cb-off')}
                                    ${_win.TankiDebug.getIcon('checkbox_checked', 'cb-svg cb-on')}
                                </div>
                            </div>
                            <div class="search-res-content" onclick="window.TankiDebug.addTarget('${r.cls}', '${r.pName}', '${r.obf}')" title="点击直接添加到预设">
                                <span class="hl-cls">${r.cls}</span>.<span style="font-weight:bold">${r.pName}</span>
                                <span style="color:var(--m3-outline); font-family:monospace; margin-left:8px;">this.${r.obf}</span>
                            </div>
                        </div>`;
                    });

                    if (results.length > limit) {
                        html += `<div style="padding:8px 16px; text-align:center; font-size:12px; color:var(--m3-on-surface-variant);">仅显示前 ${limit} 个结果，请继续输入缩小范围，或点击右上角批量操作（共 ${results.length} 个）...</div>`;
                    }
                    resArea.innerHTML = html;
                }
            } catch(e) {
                resArea.innerHTML = '<div style="padding:16px; text-align:center; color:var(--m3-error);">搜索模块崩溃，请刷新页面</div>';
            }
        },

        clearSearch: function() {
            const inp = document.getElementById('debug-search-input');
            inp.value = '';
            document.getElementById('search-res-area').innerHTML = '';
            document.getElementById('btn-clear-search').style.display = 'none';
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.currentSearchResults =[];
            this.selectedSearchResults = new Set();
        },

        toggleSearchSelect: function(key, el, e) {
            e.stopPropagation();
            if (this.selectedSearchResults.has(key)) {
                this.selectedSearchResults.delete(key);
                el.classList.remove('checked');
            } else {
                this.selectedSearchResults.add(key);
                el.classList.add('checked');
            }
        },

        copySelectedSearch: function() {
            if (this.selectedSearchResults.size === 0) {
                this.showAlert("请先勾选要复制的参数！");
                return;
            }
            const text = Array.from(this.selectedSearchResults).join('\n');
            this.copyText(text, `已成功复制 ${this.selectedSearchResults.size} 个选中参数名！`);
        },

        copyAllSearch: function() {
            if (this.currentSearchResults.length === 0) {
                this.showAlert("没有可复制的参数！");
                return;
            }
            const text = this.currentSearchResults.map(r => `${r.cls}.${r.pName}`).join('\n');
            this.copyText(text, `已成功提取并复制全部 ${this.currentSearchResults.length} 个搜索结果的参数名！`);
        },

        addSelectedSearch: function() {
            if (this.selectedSearchResults.size === 0) {
                this.showAlert("请先勾选要添加的参数！");
                return;
            }
            let addedCount = 0;
            this.currentSearchResults.forEach(r => {
                const key = `${r.cls}.${r.pName}`;
                if (this.selectedSearchResults.has(key)) {
                    this.addTargetSilent(r.cls, r.pName, r.obf);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                this.saveConfig();
                this.renderList();
                // 自动清空勾选状态，以便后续操作不重叠
                this.selectedSearchResults.clear();
                document.querySelectorAll('.custom-checkbox-wrapper').forEach(el => {
                    el.classList.remove('checked');
                });
                this.showAlert(`已成功将勾选的 ${addedCount} 个参数批量添加到预设中！`);
            }
        },

        addAllSearch: function() {
            if (this.currentSearchResults.length === 0) {
                this.showAlert("当前没有搜索结果！");
                return;
            }
            this.showConfirm(`确定要将搜索到的全部 ${this.currentSearchResults.length} 个参数添加到预设吗？`, () => {
                let addedCount = 0;
                this.currentSearchResults.forEach(r => {
                    this.addTargetSilent(r.cls, r.pName, r.obf);
                    addedCount++;
                });

                if (addedCount > 0) {
                    this.saveConfig();
                    this.renderList();
                    this.selectedSearchResults.clear();
                    document.querySelectorAll('.custom-checkbox-wrapper').forEach(el => {
                        el.classList.remove('checked');
                    });
                    this.showAlert(`已成功添加 ${addedCount} 个参数！`);
                }
            });
        },

        copyAllPresetParams: function() {
            let curProfile = this.getCurrentProfile();
            let keys = Object.keys(curProfile.targets);
            if (keys.length === 0) {
                this.showAlert("当前预设没有任何参数！");
                return;
            }

            const copyNames = () => {
                this.copyText(keys.join('\n'), `已成功提取并复制预设中的 ${keys.length} 个参数名！`);
            };

            const copyWithValues = () => {
                let lines = [];
                keys.forEach(k => {
                    let valStr = "undefined";
                    let rt = Object.values(this.runtimeDebugs).find(r => r.key === k);
                    if (rt) {
                        if (rt.origValues && rt.origValues.length > 0) {
                            valStr = this.simpleFormat(rt.origValues[rt.origValues.length - 1]);
                        } else {
                            valStr = this.simpleFormat(rt.origVal);
                        }
                    }
                    lines.push(`${k}: ${valStr}`);
                });
                this.copyText(lines.join('\n'), `已成功复制 ${lines.length} 个参数及其当前原值！`);
            };

            this.sysDialog(
                '复制选项',
                '请选择您要复制的内容：',
                [],
                [
                    { text: '取消' },
                    { text: '仅参数名', type: 'm-btn-tonal', icon: 'copy', onClick: copyNames },
                    { text: '参数名与原值', type: 'm-btn-filled', icon: 'copy', onClick: copyWithValues }
                ]
            );
        },

        addTargetSilent: function(cls, pName, currentObf) {
            const targetKey = `${cls}.${pName}`;
            let curProfile = this.getCurrentProfile();
            if (!curProfile.targets[targetKey]) curProfile.targets[targetKey] = { val: '', active: false };
            if (!this.runtimeDebugs[currentObf]) {
                this.runtimeDebugs[currentObf] = { key: targetKey, origVal: undefined, origValues:[] };
                this.applyHook(currentObf);
            }
        },

        addTarget: function(cls, pName, currentObf) {
            this.addTargetSilent(cls, pName, currentObf);
            this.saveConfig();
            this.renderList();
            this.showAlert(`已将目标 [${cls}.${pName}] 添加到当前预设！`);
        },

        removeTarget: function(targetKey) {
            let curProfile = this.getCurrentProfile();
            delete curProfile.targets[targetKey];
            this.saveConfig(); this.renderList();
        },

        updateVal: function(targetKey, newVal) {
            let curProfile = this.getCurrentProfile();
            if (curProfile.targets[targetKey]) {
                curProfile.targets[targetKey].val = newVal;
                this.saveConfig();
            }
        },

        toggleActive: function(targetKey) {
            let curProfile = this.getCurrentProfile();
            if (curProfile.targets[targetKey]) {
                curProfile.targets[targetKey].active = !curProfile.targets[targetKey].active;
                this.saveConfig(); this.renderList();
            }
        },

        switchModalView: function(viewId) {
            document.getElementById('modal-container-history').style.display = viewId === 'history' ? 'flex' : 'none';
            document.getElementById('modal-container-profiles').style.display = viewId === 'profiles' ? 'flex' : 'none';
        },

        openHistoryModal: function(key) {
            this.currentModalKey = key;
            const mask = document.getElementById('debug-modal-mask');
            document.getElementById('modal-title').innerText = key.split('.')[1] || key;
            document.getElementById('modal-subtitle').innerText = key.split('.')[0] || '';

            document.getElementById('modal-header-actions').innerHTML = `
                <button id="btn-hide-dup" class="m-action-btn ${this.hideDuplicates ? 'active' : ''}" onclick="window.TankiDebug.toggleHideDuplicates()" title="过滤重复">${_win.TankiDebug.getIcon('filter')}</button>
                <button class="m-action-btn" onclick="window.TankiDebug.exportMediaFiles()" title="提取并下载所有媒体文件">${_win.TankiDebug.getIcon('perm_media')}</button>
                <button class="m-action-btn" onclick="window.TankiDebug.exportHistoryFile()" title="保存全部代码为文件">${_win.TankiDebug.getIcon('file_export')}</button>
                <button class="m-action-btn" onclick="window.TankiDebug.copyHistory()" title="复制全部">${_win.TankiDebug.getIcon('copy')}</button>
                <button class="m-action-btn error" onclick="window.TankiDebug.clearHistory()" title="清空记录">${_win.TankiDebug.getIcon('delete')}</button>
                <button class="m-action-btn" onclick="window.TankiDebug.closeModal()" title="关闭">${_win.TankiDebug.getIcon('close')}</button>
            `;

            this.switchModalView('history');
            this.renderModalList(key);
            mask.classList.add('active');
        },

        closeModal: function() {
            document.getElementById('debug-modal-mask').classList.remove('active');
            this.currentModalKey = null;
        },

        clearHistory: function() {
            if(!this.currentModalKey) return;
            let rt = Object.values(this.runtimeDebugs).find(r => r.key === this.currentModalKey);
            if (rt) { rt.origValues =[]; this.renderModalList(this.currentModalKey); }
        },

        copyHistory: function() {
            if (!this.currentModalKey) return;
            const list = document.getElementById('modal-list');
            if (list) {
                this.copyText(list.innerText, "历史记录已复制到剪贴板！");
            }
        },

        copySingleHistory: function(index) {
            if(!this.currentModalKey) return;
            let rt = Object.values(this.runtimeDebugs).find(r => r.key === this.currentModalKey);
            if (rt && rt.origValues && rt.origValues[index] !== undefined) {
                let val = rt.origValues[index];
                let str = this.serializeValue(val);
                this.copyText(str, "单条代码记录已成功复制！");
            }
        },

        exportSingleHistory: function(index) {
            if(!this.currentModalKey) return;
            let rt = Object.values(this.runtimeDebugs).find(r => r.key === this.currentModalKey);
            if (rt && rt.origValues && rt.origValues[index] !== undefined) {
                let val = rt.origValues[index];
                let str = this.serializeValue(val);
                let blob = new Blob([str], { type: "text/plain;charset=utf-8" });
                let a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `TankiDebug_${this.currentModalKey}_记录${index}.txt`;
                a.click();
            }
        },

        exportHistoryFile: function() {
            if(!this.currentModalKey) return;
            let rt = Object.values(this.runtimeDebugs).find(r => r.key === this.currentModalKey);
            if (rt && rt.origValues && rt.origValues.length > 0) {
                let arr = rt.origValues.map((v, i) => `--- 记录 [${i}] ---\n${this.serializeValue(v)}\n`);
                let blob = new Blob([arr.join('\n')], { type: "text/plain;charset=utf-8" });
                let a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `TankiDebug_${this.currentModalKey}_全部记录.txt`;
                a.click();
            } else {
                this.showAlert("没有可导出的记录！");
            }
        },

        audioBufferToWav: function(buffer) {
            let numOfChan = buffer.numberOfChannels,
                length = buffer.length * numOfChan * 2 + 44,
                bufferWav = new ArrayBuffer(length),
                view = new DataView(bufferWav),
                channels =[], i, sample, offset = 0, pos = 0;

            function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
            function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

            setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
            setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
            setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan);
            setUint16(numOfChan * 2); setUint16(16);
            setUint32(0x61746164); setUint32(length - pos - 4);

            for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

            while (pos < length) {
                for (i = 0; i < numOfChan; i++) {
                    sample = Math.max(-1, Math.min(1, channels[i][offset]));
                    sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                    view.setInt16(pos, sample, true); pos += 2;
                }
                offset++;
            }
            return new Blob([view], { type: "audio/wav" });
        },

        extractMediaItems: async function(rootObj, prefix="media", maxDepth=5) {
            let results =[];
            let seen = new Set();
            let extractCount = 0;

            const traverse = async (obj, path, depth) => {
                if (depth > maxDepth || extractCount > 100) return;
                if (!obj || typeof obj !== 'object') return;
                if (seen.has(obj)) return;
                seen.add(obj);

                if (typeof Window !== 'undefined' && obj instanceof Window) return;
                if (typeof Document !== 'undefined' && obj instanceof Document) return;
                if (typeof Element !== 'undefined' && obj instanceof Element) {
                    if (obj.tagName !== 'CANVAS' && obj.tagName !== 'IMG' && obj.tagName !== 'AUDIO') return;
                }

                if ((typeof ImageBitmap !== 'undefined' && obj instanceof ImageBitmap) ||
                    (typeof HTMLImageElement !== 'undefined' && obj instanceof HTMLImageElement) ||
                    (typeof HTMLCanvasElement !== 'undefined' && obj instanceof HTMLCanvasElement) ||
                    (typeof ImageData !== 'undefined' && obj instanceof ImageData)) {
                    try {
                        let canvas = document.createElement('canvas');
                        let ctx = canvas.getContext('2d');
                        let w = obj.width || 0;
                        let h = obj.height || 0;

                        if (w > 0 && h > 0) {
                            canvas.width = w; canvas.height = h;
                            if (obj instanceof ImageData) {
                                ctx.putImageData(obj, 0, 0);
                            } else {
                                ctx.drawImage(obj, 0, 0);
                            }
                            let blob = await new Promise(r => {
                                try { canvas.toBlob(r, 'image/png'); } catch(e) { r(null); }
                            });
                            if (blob) {
                                results.push({ name: `${path}.png`, blob });
                                extractCount++;
                            }
                        }
                    } catch(e) {}
                    return;
                }

                if (typeof AudioBuffer !== 'undefined' && obj instanceof AudioBuffer) {
                    try {
                        let blob = this.audioBufferToWav(obj);
                        if (blob) {
                            results.push({ name: `${path}.wav`, blob });
                            extractCount++;
                        }
                    } catch(e) {}
                    return;
                }

                if (typeof Blob !== 'undefined' && obj instanceof Blob) {
                    let ext = obj.type ? obj.type.split('/')[1] : 'bin';
                    if (ext && ext.includes('+')) ext = ext.split('+')[0];
                    results.push({ name: `${path}.${ext || 'bin'}`, blob: obj });
                    extractCount++;
                    return;
                }

                if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) return;

                if (Array.isArray(obj)) {
                    for (let i = 0; i < obj.length; i++) {
                        await traverse(obj[i], `${path}[${i}]`, depth + 1);
                    }
                } else {
                    let keys =[];
                    try { keys = Object.keys(obj); } catch(e) {}
                    for (let key of keys) {
                        try { await traverse(obj[key], `${path}.${key}`, depth + 1); } catch(e) {}
                    }
                }
            };

            try {
                await Promise.race([
                    traverse(rootObj, prefix, 0),
                    new Promise(r => setTimeout(r, 5000))
                ]);
            } catch(e) {}

            return results;
        },

        exportMediaFiles: async function(historyIndex = null) {
            if (!this.currentModalKey) return;
            let rt = Object.values(this.runtimeDebugs).find(r => r.key === this.currentModalKey);
            if (!rt || !rt.origValues || rt.origValues.length === 0) {
                this.showAlert("没有可导出的媒体！");
                return;
            }

            this.sysDialog('提取媒体', '正在扫描并提取媒体内容，请稍候...\n(加入防卡死机制：最多等待 5 秒即出结果)', [],[]);

            try {
                let allMedia = [];
                if (historyIndex !== null && rt.origValues[historyIndex] !== undefined) {
                    let items = await this.extractMediaItems(rt.origValues[historyIndex], `记录${historyIndex}`);
                    allMedia.push(...items);
                } else {
                    let startIdx = Math.max(0, rt.origValues.length - 10);
                    for (let i = startIdx; i < rt.origValues.length; i++) {
                        let items = await this.extractMediaItems(rt.origValues[i], `记录${i}`);
                        allMedia.push(...items);
                    }
                }

                document.getElementById('m3-sys-dialog').classList.remove('active');

                if (allMedia.length === 0) {
                    setTimeout(() => {
                        this.showAlert("当前数据中未找到支持导出的媒体对象。\n这可能是一个普通文本参数，或者目标图片已被游戏引擎销毁回收。");
                    }, 200);
                    return;
                }

                this.showAlert(`扫描完毕，共找到 ${allMedia.length} 个文件。\n\n浏览器即将开始依次分离下载，\n请注意浏览器顶部的【允许下载多个文件】提示并点击允许！`);

                allMedia.forEach((m, index) => {
                    setTimeout(() => {
                        let safeName = m.name.replace(/[^a-zA-Z0-9.\-_[\]\u4e00-\u9fa5]/g, '_');
                        let a = document.createElement('a');
                        a.href = URL.createObjectURL(m.blob);
                        a.download = `TankiDebug_${this.currentModalKey}_${safeName}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
                    }, index * 300);
                });

            } catch (e) {
                document.getElementById('m3-sys-dialog').classList.remove('active');
                setTimeout(() => {
                    this.showAlert("导出过程中发生意外错误: " + e.message);
                }, 200);
            }
        },

        toggleHideDuplicates: function() {
            this.hideDuplicates = !this.hideDuplicates;
            const btn = document.getElementById('btn-hide-dup');
            if(btn) btn.classList.toggle('active', this.hideDuplicates);
            if(this.currentModalKey) this.renderModalList(this.currentModalKey);
        },

        renderModalList: function(key) {
            const list = document.getElementById('modal-list');
            if(!list) return; list.innerHTML = '';
            let rt = Object.values(this.runtimeDebugs).find(r => r.key === key);
            if (!rt || !rt.origValues || rt.origValues.length === 0) {
                list.innerHTML = '<div style="text-align:center; color:var(--m3-outline); margin-top:30px;">暂无历史记录，请在游戏中触发该参数</div>';
                return;
            }
            let htmlBuffer = "";
            const len = rt.origValues.length;
            let lastContent = null;
            const MAX_TOTAL_CHARS = 300000;
            const MAX_SINGLE_CHARS = 30000;
            let currentTotalChars = 0;
            let renderedCount = 0;

            for (let i = len - 1; i >= 0; i--) {
                const v = rt.origValues[i];
                let displayHtml = this.deepInspect(v, 0, 15, new WeakSet(), 50);

                if (this.hideDuplicates) {
                    if (displayHtml === lastContent) continue;
                    lastContent = displayHtml;
                }

                if (displayHtml.length > MAX_SINGLE_CHARS) {
                    displayHtml = displayHtml.substring(0, MAX_SINGLE_CHARS) +
                        `\n...<br/><br/><span style="color:var(--m3-error); font-weight:bold;">[该条数据体积过大，为防止卡顿预览已截断，请点击右上方“保存为文件”查看完整代码]</span>`;
                }

                const itemHtml = `<div class="modal-item">
                    <div class="modal-item-header">
                        <span class="val-index">记录 #${len - i}</span>
                        <div class="val-actions">
                            <button class="m-action-btn" onclick="window.TankiDebug.exportMediaFiles(${i})" title="提取并下载此条包含的媒体">
                                ${_win.TankiDebug.getIcon('download', '', 'width:20px;height:20px;')}
                            </button>
                            <button class="m-action-btn" onclick="window.TankiDebug.copySingleHistory(${i})" title="复制此条代码">
                                ${_win.TankiDebug.getIcon('copy', '', 'width:20px;height:20px;')}
                            </button>
                            <button class="m-action-btn" onclick="window.TankiDebug.exportSingleHistory(${i})" title="保存代码为文件">
                                ${_win.TankiDebug.getIcon('file_export', '', 'width:20px;height:20px;')}
                            </button>
                        </div>
                    </div>
                    <div class="val-content">${displayHtml}</div>
                </div>`;

                if (currentTotalChars + itemHtml.length > MAX_TOTAL_CHARS) {
                    if (renderedCount === 0) {
                        htmlBuffer += itemHtml;
                    }
                    htmlBuffer += `<div style="text-align:center; padding:16px; color:var(--m3-on-surface-variant); font-size:12px; margin-top:10px; border-top: 1px dashed rgba(255,255,255,0.1);">
                        <span style="color:var(--m3-error); font-weight:bold; font-size: 14px;">预览视图数据量已达安全上限</span><br/><br/>
                        为防止浏览器内存溢出或卡顿，剩余 <span style="color:var(--m3-cyan)">${i + 1}</span> 条更早的历史记录已被隐藏。<br/>
                        请点击顶部菜单的 <b>[保存全部为文件]</b> 导出并查看完整历史记录。
                    </div>`;
                    break;
                }

                htmlBuffer += itemHtml;
                currentTotalChars += itemHtml.length;
                renderedCount++;
            }

            list.innerHTML = htmlBuffer;
        },

        openProfileManager: function() {
            document.getElementById('modal-title').innerText = '配置管理';
            document.getElementById('modal-subtitle').innerText = '管理您的参数预设';
            this.switchModalView('profiles');

            document.getElementById('modal-header-actions').innerHTML = `
                <button class="m-action-btn" onclick="window.TankiDebug.importFlow()" title="导入预设">${_win.TankiDebug.getIcon('import')}</button>
                <button class="m-action-btn" onclick="window.TankiDebug.createProfile()" title="新建预设">${_win.TankiDebug.getIcon('add')}</button>
                <button class="m-action-btn" onclick="window.TankiDebug.closeModal()" title="关闭">${_win.TankiDebug.getIcon('close')}</button>
            `;

            const pmList = document.getElementById('pm-list');
            pmList.innerHTML = this.config.profiles.map(p => `
                <div class="pm-card" style="${p.id === this.config.currentProfileId ? 'border-color: var(--m3-primary); box-shadow: 0 0 0 1px var(--m3-primary);' : ''}" onclick="window.TankiDebug.switchProfile('${p.id}')">
                    <div style="flex:1; overflow:hidden; pointer-events:none;">
                        <div style="font-size:16px; font-weight:600; color:var(--m3-on-surface); margin-bottom:4px; display:flex; align-items:center; gap:8px;">
                            ${this.escapeHtml(p.name)}
                            ${p.id === this.config.currentProfileId ? '<span style="background:var(--m3-primary); color:var(--m3-on-primary); font-size:10px; padding:2px 6px; border-radius:100px; flex-shrink:0;">正在编辑</span>' : ''}
                        </div>
                        <div style="font-size:12px; color:var(--m3-on-surface-variant); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            作者: <span style="color:var(--m3-primary)">${this.escapeHtml(p.author)}</span> | 参数: ${Object.keys(p.targets).length} 个
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;" onclick="event.stopPropagation()">
                        <div class="m3-switch ${p.enabled ? 'on' : ''}" style="margin-right:8px;" onclick="window.TankiDebug.toggleProfileEnabled('${p.id}', event)">
                            <div class="m3-switch-thumb"></div>
                        </div>
                        <button class="m-action-btn" onclick="window.TankiDebug.editProfile('${p.id}')" title="编辑名称/作者">${_win.TankiDebug.getIcon('edit')}</button>
                        <button class="m-action-btn" onclick="window.TankiDebug.exportFlow('${p.id}')" title="导出预设">${_win.TankiDebug.getIcon('export')}</button>
                        <button class="m-action-btn error" onclick="window.TankiDebug.deleteProfile('${p.id}')" title="删除">${_win.TankiDebug.getIcon('delete')}</button>
                    </div>
                </div>
            `).join('');

            document.getElementById('debug-modal-mask').classList.add('active');
        },

        switchProfile: function(id) {
            this.config.currentProfileId = id;
            this.saveConfig();
            this.renderProfileBar();
            this.renderList();
            this.closeModal();
        },

        toggleProfileEnabled: function(id, e) {
            if(e) {
                e.stopPropagation();
                const switchEl = e.currentTarget;
                if(switchEl) switchEl.classList.toggle('on');
            }

            const switchBtn = e ? e.currentTarget : null;

            setTimeout(() => {
                let p = this.config.profiles.find(x => x.id === id);
                if (!p.enabled) {
                    let conflicts =[];
                    let others = this.config.profiles.filter(x => x.enabled && x.id !== p.id);
                    let myKeys = Object.keys(p.targets);
                    others.forEach(other => {
                        let intersection = myKeys.filter(k => Object.keys(other.targets).includes(k));
                        if (intersection.length > 0) conflicts.push(`与 [${other.name}] 冲突:\n   ${intersection.join('\n   ')}`);
                    });

                    if (conflicts.length > 0) {
                        if(switchBtn) switchBtn.classList.toggle('on');
                        this.showAlert("无法启用预设！\n检测到同名参数冲突：\n\n" + conflicts.join("\n\n") + "\n\n请修改冲突参数后再尝试启用。");
                        return;
                    }
                }
                p.enabled = !p.enabled;
                this.saveConfig();

                if (document.getElementById('debug-modal-mask').classList.contains('active') &&
                    document.getElementById('modal-container-profiles').style.display === 'flex') {
                    this.openProfileManager();
                }
                this.renderProfileBar();
                this.renderList();
                this.runAutoScan();
            }, 250);
        },

        createProfile: function() {
            this.sysDialog('新建预设', '创建一个新的参数调试预设。',[
                { id: 'pName', label: '预设名称', placeholder: '新预设', value: '' },
                { id: 'pAuthor', label: '作者', placeholder: '匿名', value: '' }
            ],[
                { text: '取消' },
                { text: '创建', type: 'm-btn-filled', onClick: (res) => {
                    let finalName = res.pName.trim() || '新预设';
                    let finalAuthor = res.pAuthor.trim() || '匿名';
                    let newId = this.generateId();
                    this.config.profiles.push({ id: newId, name: finalName, author: finalAuthor, enabled: true, targets: {} });
                    this.switchProfile(newId);
                }}
            ]);
        },

        editProfile: function(id) {
            let p = this.config.profiles.find(x => x.id === id);
            this.sysDialog('修改配置信息', '您可以修改该预设的名称和作者。',[
                { id: 'pName', label: '预设名称', placeholder: '预设名称', value: p.name },
                { id: 'pAuthor', label: '作者', placeholder: '作者名称', value: p.author }
            ],[
                { text: '取消' },
                { text: '保存', type: 'm-btn-filled', onClick: (res) => {
                    let finalName = res.pName.trim() || p.name || '未命名预设';
                    let finalAuthor = res.pAuthor.trim() || '匿名';
                    p.name = finalName; p.author = finalAuthor;
                    this.saveConfig(); this.openProfileManager(); this.renderProfileBar();
                }}
            ]);
        },

        deleteProfile: function(id) {
            if (this.config.profiles.length <= 1) { this.showAlert("至少需保留一个预设！"); return; }
            this.showConfirm("确定删除此预设吗？删除后将无法恢复。", () => {
                this.config.profiles = this.config.profiles.filter(p => p.id !== id);
                if (this.config.currentProfileId === id) this.config.currentProfileId = this.config.profiles[0].id;
                this.saveConfig(); this.openProfileManager(); this.renderProfileBar(); this.renderList();
            });
        },

        exportFlow: function(id) {
            let p = this.config.profiles.find(x => x.id === id);
            let expObj = { name: p.name, author: p.author, targets: p.targets };
            let jsonStr = JSON.stringify(expObj, null, 2);

            this.sysDialog('导出预设', `您要如何导出预设 [${p.name}] ？`, [],[
                { text: '取消' },
                { text: '复制到剪贴板', icon: 'clipboard', type: 'm-btn-tonal', onClick: () => {
                    this.copyText(jsonStr, "已成功复制预设配置！");
                }},
                { text: '保存为文件', icon: 'file_export', type: 'm-btn-filled', onClick: () => {
                    let blob = new Blob([jsonStr], { type: "application/json" });
                    let a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `TankDebug_${p.name}.json`;
                    a.click();
                }}
            ]);
        },

        importFlow: function() {
            this.sysDialog('导入预设', '请选择您想要导入预设的方式：', [],[
                { text: '取消' },
                { text: '从剪贴板解析', icon: 'clipboard', type: 'm-btn-tonal', onClick: async () => {
                    try {
                        let text = await navigator.clipboard.readText();
                        let data = JSON.parse(text);
                        this.processImportData(data);
                    } catch(e) { this.showAlert("解析失败，请确保您复制了完整的预设JSON代码。"); }
                }},
                { text: '选择本地文件', icon: 'file_add', type: 'm-btn-filled', onClick: () => {
                    let input = document.createElement('input');
                    input.type = 'file'; input.accept = '.json';
                    input.onchange = e => {
                        let file = e.target.files[0];
                        if (!file) return;
                        let reader = new FileReader();
                        reader.onload = ev => {
                            try {
                                let data = JSON.parse(ev.target.result);
                                this.processImportData(data);
                            } catch(err) { this.showAlert("文件解析失败，这不是一个合法的预设文件。"); }
                        };
                        reader.readAsText(file);
                    };
                    input.click();
                }}
            ]);
        },

        processImportData: function(data) {
            if (!data || typeof data !== 'object') {
                this.showAlert("不是合法的配置代码！");
                return;
            }

            let newId = this.generateId();
            this.config.profiles.push({
                id: newId,
                name: (data.name || "新预设") + " (导入)",
                author: data.author || "未知",
                enabled: true,
                targets: data.targets || {}
            });
            this.switchProfile(newId);
        },

        applyHook: function(obfName) {
            if (!obfName || typeof obfName !== 'string') return;
            if (Object.prototype.hasOwnProperty.call(_win.Object.prototype, obfName)) return;
            const instanceValues = new WeakMap();

            const handleAutoFill = function(mergedTargetInfo, realVal, rt) {
                if (mergedTargetInfo && (mergedTargetInfo.val === '' || mergedTargetInfo.val === null) && realVal !== undefined) {
                    let formatVal = "";
                    try { formatVal = JSON.stringify(realVal); } catch(e) { formatVal = String(realVal); }
                    let profile = _win.TankiDebug.config.profiles.find(p => p.id === mergedTargetInfo.profileId);
                    if (profile && profile.targets[rt.key]) {
                        profile.targets[rt.key].val = String(formatVal);
                        _win.TankiDebug.saveConfig();
                        requestAnimationFrame(() => {
                            if (_win.TankiDebug.config.currentProfileId === profile.id) {
                                const inp = document.getElementById(`input-${rt.key.replace('.', '-')}`);
                                if(inp && document.activeElement !== inp) inp.value = profile.targets[rt.key].val;
                            }
                        });
                    }
                }
            };

            const getHandler = function() {
                const realVal = instanceValues.get(this);
                const rt = _win.TankiDebug.runtimeDebugs[obfName];
                if (rt) {
                    const mergedTargets = _win.TankiDebug.getMergedTargets();
                    const targetData = mergedTargets[rt.key];

                    if (targetData) {
                        if (!rt.origValues) rt.origValues =[];
                        if (realVal !== undefined) rt.origValues.push(realVal);
                        rt.origVal = realVal;

                        if (targetData.active && targetData.val !== '' && targetData.val !== null) {
                            try {
                                const tv = targetData.val.trim();

                                if (tv.startsWith('js:')) {
                                    try {
                                        let func = new Function('$', tv.substring(3));
                                        let result = func(realVal);
                                        return result !== undefined ? result : realVal;
                                    } catch(e) {
                                        console.error("TankiDebug JS Exec Error:", e);
                                        return realVal;
                                    }
                                }

                                if (tv === 'true') return true; if (tv === 'false') return false;
                                if (!isNaN(Number(tv))) return Number(tv);

                                let cleanTv = tv.replace(/^[a-zA-Z0-9_$]+\s*(?=\{)/, '').trim();
                                if (cleanTv.startsWith('{') || cleanTv.startsWith('[')) {
                                    let parsedObj;
                                    try { parsedObj = JSON.parse(cleanTv); }
                                    catch(e) { parsedObj = (new Function('return ' + cleanTv))(); }

                                    if (realVal !== null && typeof realVal === 'object') {
                                        const deepMerge = (target, source) => {
                                            if (!target || typeof target !== 'object') return source;
                                            if (Array.isArray(source)) {
                                                for (let i = 0; i < source.length; i++) {
                                                    target[i] = deepMerge(target[i], source[i]);
                                                }
                                            } else {
                                                for (let k in source) {
                                                    if (Object.prototype.hasOwnProperty.call(source, k)) {
                                                        target[k] = deepMerge(target[k], source[k]);
                                                    }
                                                }
                                            }
                                            return target;
                                        };
                                        return deepMerge(realVal, parsedObj);
                                    }
                                    return parsedObj;
                                }
                                return tv;
                            } catch(e) {}
                        }
                        handleAutoFill(targetData, realVal, rt);
                    }
                }
                return realVal;
            };

            const setHandler = function(val) {
                instanceValues.set(this, val);
                const rt = _win.TankiDebug.runtimeDebugs[obfName];
                if (rt) {
                    const mergedTargets = _win.TankiDebug.getMergedTargets();
                    const targetData = mergedTargets[rt.key];

                    if (targetData) {
                        if (!rt.origValues) rt.origValues =[];
                        if (val !== undefined) rt.origValues.push(val);
                        rt.origVal = val;
                        handleAutoFill(targetData, val, rt);
                    }
                }
            };

            try {
                Object.defineProperty(_win.Object.prototype, obfName, {
                    get: getHandler,
                    set: function(v) {
                        try {
                            Object.defineProperty(this, obfName, { get: getHandler, set: setHandler, enumerable: true, configurable: true });
                            this[obfName] = v;
                        } catch (e) { setHandler.call(this, v); }
                    },
                    enumerable: false, configurable: true
                });
            } catch (e) {}
        },

        startUIRefreshLoop: function() {
            const refreshUI = () => {
                const list = document.getElementById('debug-list-area');
                if(list) {
                    let curProfile = this.getCurrentProfile();
                    Object.keys(curProfile.targets).forEach(key => {
                        const btn = document.getElementById(`orig-btn-${key.replace('.', '-')}`);
                        let rt = Object.values(this.runtimeDebugs).find(r => r.key === key);
                        if (btn && rt) {
                            let txt = '等待获取...';
                            if (rt.origValues && rt.origValues.length > 0) {
                                txt = `${this.simpleFormat(rt.origValues[rt.origValues.length - 1])} (${rt.origValues.length})`;
                            } else if (rt.origVal !== undefined) {
                                txt = `${this.simpleFormat(rt.origVal)}`;
                            }
                            const newText = `原值: ${txt}`;
                            if (btn.innerText !== newText) btn.innerText = newText;
                        }
                    });
                }
                requestAnimationFrame(refreshUI);
            };
            requestAnimationFrame(refreshUI);
        },

        escapeHtml: function(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        },

        renderProfileBar: function() {
            let p = this.getCurrentProfile();
            const bar = document.getElementById('main-profile-bar');
            if (bar) {
                bar.innerHTML = `
                    <div class="m3-profile-info-area" onclick="window.TankiDebug.openProfileManager()" title="点击进入配置管理">
                        <div class="m3-profile-title">${_win.TankiDebug.getIcon('tune', '', 'width:18px;height:18px;')} 当前编辑：${this.escapeHtml(p.name)}</div>
                        <div class="m3-profile-sub">点击进入配置管理 | 作者: ${this.escapeHtml(p.author)}</div>
                    </div>
                    <div class="m3-switch ${p.enabled ? 'on' : ''}" onclick="window.TankiDebug.toggleProfileEnabled('${p.id}', event);">
                        <div class="m3-switch-thumb"></div>
                    </div>
                `;
            }
        },

            renderList: function() {
                const listEl = document.getElementById('debug-list-area');
                if (!listEl) return;
                this.renderProfileBar();

                const curProfile = this.getCurrentProfile();
                const keys = Object.keys(curProfile.targets);

                if (keys.length === 0) {
                    listEl.innerHTML = `<div style="text-align:center; padding:40px 10px; color:var(--m3-outline);">
                    ${_win.TankiDebug.getIcon('file_add', '', 'width:48px; height:48px; opacity:0.5; display:block; margin: 0 auto 16px auto;')}
                    预设尚无参数<br/><span style="font-size:12px;opacity:0.8;">请在上方搜索并添加</span>
                </div>`;
                return;
            }

            let html = '';
            keys.forEach(key => {
                const target = curProfile.targets[key];
                const [cls, pName] = key.split('.');
                const safeId = key.replace('.', '-');
                let rt = Object.values(this.runtimeDebugs).find(r => r.key === key);
                let isFound = !!rt;

                html += `
                <div class="debug-card ${target.active && isFound && curProfile.enabled ? 'active-debug' : ''}" style="${!isFound && !this.isScanning ? 'opacity:0.7;' : ''}">
                    <div class="card-header">
                        <div style="flex:1; overflow:hidden; padding-right:8px;">
                            <div class="card-title card-title-clickable"
                                 onclick="window.TankiDebug.copyText('${key}', '参数名 [ ${key} ] 已复制！')"
                                 title="点击复制参数名">
                                ${cls}.${pName}
                                ${_win.TankiDebug.getIcon('copy', '', 'width:14px;height:14px;opacity:0.7;')}
                            </div>
                            <div class="card-sub" style="color:${isFound ? 'var(--m3-cyan)' : 'var(--m3-error)'}">
                                ${isFound ? '已定位参数' : (this.isScanning ? '正在扫描源码...' : '等待参数出现...')}
                            </div>
                        </div>
                        <button class="btn-icon btn-del" onclick="window.TankiDebug.removeTarget('${key}')" title="删除">${_win.TankiDebug.getIcon('delete')}</button>
                    </div>
                    <div class="card-controls">
                        <input id="input-${safeId}" class="card-input" value="${this.escapeHtml(target.val)}" oninput="window.TankiDebug.updateVal('${key}', this.value)" placeholder="注入值..." ${!isFound ? 'disabled' : ''}>
                        <button class="orig-val-btn" id="orig-btn-${safeId}" onclick="window.TankiDebug.openHistoryModal('${key}')" title="点击查看详情">原值: 等待获取...</button>
                        <button class="btn-icon btn-lock ${target.active ? 'is-locked' : ''}" onclick="window.TankiDebug.toggleActive('${key}')" title="${target.active ? '已锁定' : '未锁定'}">${_win.TankiDebug.getIcon(target.active ? 'lock' : 'lock_open')}</button>
                    </div>
                </div>`;
            });
            listEl.innerHTML = html;
        }
};

_win.TankiDebug.init();

function createUI() {
    const root = document.createElement('div');
    root.id = 'debug-root';
    root.innerHTML = `
            <style>${M3_STYLES}</style>

            <div id="m3-sys-dialog" class="m3-mask">
                <div class="m3-sys-surface">
                    <div class="sys-headline" id="sys-dialog-title">标题</div>
                    <div class="sys-text" id="sys-dialog-content"></div>
                    <div class="sys-inputs" id="sys-dialog-inputs"></div>
                    <div class="sys-actions" id="sys-dialog-actions"></div>
                </div>
            </div>

            <div id="debug-modal-mask" class="m3-mask">
                <div class="m3-modal">
                    <div class="modal-header">
                        <div class="modal-header-titles">
                            <span id="modal-title" class="modal-title">参数信息</span>
                            <span id="modal-subtitle" class="modal-subtitle">所在类</span>
                        </div>
                        <div class="modal-header-actions" id="modal-header-actions"></div>
                    </div>

                    <div id="modal-container-history" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <div id="modal-list" class="modal-body"></div>
                    </div>

                    <div id="modal-container-profiles" style="display:none; flex-direction:column; flex:1; overflow:hidden;">
                        <div id="pm-list" class="modal-body"></div>
                    </div>
                </div>
            </div>

            <button id="debug-toggle" onclick="document.getElementById('debug-panel').classList.toggle('active')">${_win.TankiDebug.getIcon('tune', '', 'width:28px; height:28px;')}</button>

            <div id="debug-panel">
                <div class="panel-header">
                    <div class="search-container">
                        <input id="debug-search-input" class="search-input" placeholder="搜索 (支持 类名.参数名 或 用空格隔开)..."
                            oninput="window.TankiDebug.handleSearchInput(this)"
                            onkeydown="if(event.key==='Enter'){ clearTimeout(window.TankiDebug.searchTimeout); window.TankiDebug.search(); }">
                        <button id="btn-clear-search" class="btn-icon" style="display:none; margin-right:2px;" onclick="window.TankiDebug.clearSearch()">${_win.TankiDebug.getIcon('close', '', 'width:18px; height:18px;')}</button>
                        <button class="btn-icon" onclick="window.TankiDebug.search()">${_win.TankiDebug.getIcon('search', '', 'width:20px; height:20px; color:var(--m3-primary);')}</button>
                    </div>
                    <div id="search-res-area" style="max-height:200px; overflow-y:auto;"></div>
                </div>

                <div class="panel-content">
                    <div id="main-profile-bar" class="m3-profile-bar-container"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; margin-top:8px; padding-right:4px;">
                        <div style="font-size:14px; font-weight:600; color:var(--m3-on-surface);">预设包含的参数</div>
                        <button class="orig-val-btn" onclick="window.TankiDebug.copyAllPresetParams()" title="复制当前预设下所有的参数" style="display:flex; align-items:center; gap:4px; max-width:none; padding:4px 12px;">
                            ${_win.TankiDebug.getIcon('copy', '', 'width:14px;height:14px;')} 复制全部参数
                        </button>
                    </div>
                    <div id="debug-list-area"></div>
                </div>
            </div>`;['keydown', 'keyup', 'keypress', 'input'].forEach(evt => {
                root.addEventListener(evt, e => e.stopPropagation());
            });

        const toggleBtn = root.querySelector('#debug-toggle');
        if (toggleBtn) {
            toggleBtn.onclick = function() {
                this.blur();
                document.getElementById('debug-panel').classList.toggle('active');
            };
        }

        document.body.appendChild(root);
        _win.TankiDebug.renderList();
    }

function injectUI() {
    if (document.body) { createUI(); }
    else {
        const observer = new MutationObserver((mutations, obs) => {
            if (document.body) { obs.disconnect(); createUI(); }
        });
        observer.observe(document.documentElement, { childList: true });
    }
}
injectUI();
})();
