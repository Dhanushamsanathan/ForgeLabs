<script setup lang="ts">
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, Box, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, Cpu, Database, Ellipsis, ExternalLink, FlaskConical, FolderOpen, Gauge, GitBranch, HardDrive, Layers, LayoutDashboard, LoaderCircle, LogOut, Menu, Play, Plus, Radio, Search, Server, Settings2, ShieldCheck, SlidersHorizontal, Square, Terminal, TriangleAlert, X, Zap } from '@lucide/vue'
const icons: Record<string, any> = { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, Box, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, Cpu, Database, Ellipsis, ExternalLink, FlaskConical, FolderOpen, Gauge, GitBranch, HardDrive, Layers, LayoutDashboard, LoaderCircle, LogOut, Menu, Play, Plus, Radio, Search, Server, Settings2, ShieldCheck, SlidersHorizontal, Square, Terminal, TriangleAlert, X, Zap }
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })
</script>
<template><component :is="icons[name] || icons.Box" :size="size" :stroke-width="1.7" aria-hidden="true" /></template>
