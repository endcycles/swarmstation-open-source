#!/bin/bash

# Script to clean up PRs that include unintended commits

echo "🧹 Cleaning up PRs with unintended commits..."

# Function to update a PR branch
update_pr() {
    local pr_number=$1
    local branch_name=$2
    local file_to_keep=$3
    
    echo ""
    echo "📋 Processing PR #$pr_number (branch: $branch_name)"
    
    # Fetch the latest
    git fetch origin
    
    # Create a temporary branch from origin/main
    temp_branch="temp-fix-$pr_number"
    git checkout -b $temp_branch origin/main
    
    # Cherry-pick only the commit that creates the documentation file
    # We need to find the commit that actually creates the file
    commit_sha=$(gh pr view $pr_number --repo endcycles/swarmstation-mvp --json commits --jq ".commits[] | select(.messageHeadline | contains(\"$file_to_keep\")) | .oid")
    
    if [ -z "$commit_sha" ]; then
        echo "❌ Could not find commit for $file_to_keep"
        git checkout main
        git branch -D $temp_branch
        return 1
    fi
    
    echo "📝 Cherry-picking commit: $commit_sha"
    git cherry-pick $commit_sha
    
    # Force push to update the PR
    echo "🚀 Force pushing to $branch_name"
    git push --force origin $temp_branch:$branch_name
    
    # Clean up
    git checkout main
    git branch -D $temp_branch
    
    echo "✅ PR #$pr_number updated successfully"
}

# Update each PR
echo "Starting cleanup process..."

# PR #80 - CONTRIBUTING.md
update_pr 80 "issue-77" "CONTRIBUTING.md"

# PR #81 - TROUBLESHOOTING.md  
update_pr 81 "issue-79" "TROUBLESHOOTING.md"

# PR #82 - ARCHITECTURE.md
update_pr 82 "issue-78" "ARCHITECTURE.md"

echo ""
echo "🎉 Cleanup complete! Check the PRs on GitHub."