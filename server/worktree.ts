import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'

const WORKTREES_DIR = path.join(os.homedir(), '.agentpower', 'worktrees')

/**
 * Create a git worktree for an agent.
 * The worktree is created in ~/.agentpower/worktrees/<agentId>/ as a detached HEAD
 * branching from the repo's current HEAD.
 *
 * @param repoPath - The source git repository path
 * @param agentId - The agent ID (used for the worktree directory name and branch name)
 * @returns The path to the new worktree directory
 */
export function createWorktree(repoPath: string, agentId: string): string {
  // Verify the source is a git repo
  const gitDir = path.join(repoPath, '.git')
  if (!existsSync(gitDir) && !existsSync(repoPath + '/.git')) {
    throw new Error(`Not a git repository: ${repoPath}`)
  }

  mkdirSync(WORKTREES_DIR, { recursive: true })
  const shortId = agentId.slice(0, 8)
  const worktreePath = path.join(WORKTREES_DIR, shortId)

  if (existsSync(worktreePath)) {
    // Worktree already exists (maybe leftover from a previous agent)
    console.log(`[worktree] Reusing existing worktree at ${worktreePath}`)
    return worktreePath
  }

  const branchName = `agentpower/${shortId}`

  try {
    // Create a new branch + worktree
    execSync(
      `git worktree add -b "${branchName}" "${worktreePath}"`,
      { cwd: repoPath, stdio: 'pipe', windowsHide: true },
    )
    console.log(`[worktree] Created worktree at ${worktreePath} (branch: ${branchName})`)
  } catch (err) {
    // Branch may already exist — try without -b
    try {
      execSync(
        `git worktree add "${worktreePath}" "${branchName}"`,
        { cwd: repoPath, stdio: 'pipe', windowsHide: true },
      )
      console.log(`[worktree] Created worktree at ${worktreePath} (existing branch: ${branchName})`)
    } catch (err2) {
      const msg = err2 instanceof Error ? err2.message : String(err2)
      throw new Error(`Failed to create git worktree: ${msg}`)
    }
  }

  return worktreePath
}

/**
 * Remove a git worktree for an agent.
 * Safe to call even if the worktree doesn't exist.
 */
export function removeWorktree(repoPath: string, agentId: string): void {
  const shortId = agentId.slice(0, 8)
  const worktreePath = path.join(WORKTREES_DIR, shortId)

  if (!existsSync(worktreePath)) return

  try {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: repoPath,
      stdio: 'pipe',
      windowsHide: true,
    })
    console.log(`[worktree] Removed worktree at ${worktreePath}`)
  } catch (err) {
    console.warn(`[worktree] Failed to remove worktree: ${err instanceof Error ? err.message : err}`)
  }

  // Also try to delete the branch
  const branchName = `agentpower/${shortId}`
  try {
    execSync(`git branch -D "${branchName}"`, { cwd: repoPath, stdio: 'pipe', windowsHide: true })
  } catch {
    // Branch may not exist or may have been merged — ignore
  }
}

/**
 * Check if a path is a git repository.
 */
export function isGitRepo(dirPath: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dirPath,
      stdio: 'pipe',
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}
