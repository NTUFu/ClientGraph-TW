import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
const repository = process.env.GITHUB_REPOSITORY || ''
const repositoryName = repository.split('/')[1] || ''

const base = isGitHubActions && repositoryName ? `/${repositoryName}/` : '/'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base,
})
