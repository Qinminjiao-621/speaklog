import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({base:'/speaklog/',plugins:[react(),VitePWA({registerType:'prompt',includeAssets:['icon-192.png','icon-512.png'],manifest:{name:'SpeakLog 英语口语笔记',short_name:'SpeakLog',lang:'zh-CN',description:'个人英语口语每日笔记：收录、查看、搜索与备份。',start_url:'/speaklog/',scope:'/speaklog/',display:'standalone',theme_color:'#f2f2f7',background_color:'#f5f6f8',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]},workbox:{globPatterns:['**/*.{js,css,html,png,svg,ico}'],navigateFallback:'index.html'}})]});
