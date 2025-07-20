# SwarmStation

> Deploy multiple Claude agents to work on GitHub issues simultaneously

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![GitHub CLI](https://img.shields.io/badge/GitHub%20CLI-Required-orange.svg)](https://cli.github.com)
[![Claude CLI](https://img.shields.io/badge/Claude%20CLI-Required-purple.svg)](https://claude.ai/cli)

SwarmStation is a desktop application that coordinates multiple Claude AI agents to work on GitHub issues in parallel. Each agent operates independently in its own workspace, creating branches, implementing fixes, and submitting pull requests automatically.

## 🚀 Features

- **Parallel Agent Deployment**: Work on multiple issues simultaneously with independent Claude agents
- **Smart Issue Creation**: Natural language issue creation with automatic classification and labeling
- **Isolated Workspaces**: Each agent gets its own repository clone for conflict-free development
- **Real-time Monitoring**: Track agent progress, view logs, and manage deployments from a unified interface
- **Automatic PR Creation**: Agents create branches, commit changes, and submit pull requests autonomously
- **Performance Optimized**: 5x faster issue creation with intelligent caching and batch processing

## 📋 Requirements

- Node.js 18 or higher
- GitHub CLI (`gh`) - [Installation guide](https://cli.github.com/manual/installation)
- Claude CLI - [Get access](https://claude.ai/cli)
- GitHub account with repository access

## 🛠️ Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/swarmstation.git
cd swarmstation

# Install dependencies
npm install

# Start the application
npm start
```

### Building for Distribution

```bash
# Create standalone executable
npm run build
```

## 🎯 Getting Started

### 1. Initial Setup

```bash
# Authenticate GitHub CLI
gh auth login

# Verify Claude CLI is installed
claude --version
```

### 2. Launch SwarmStation

```bash
npm start
```

### 3. Deploy Your First Agent

1. **Select Repository**: Choose from your GitHub repositories or enter `owner/repo`
2. **Pick Issues**: Select one or more issues to work on
3. **Deploy Agents**: Click "Deploy Agents" to start autonomous development
4. **Monitor Progress**: Watch real-time logs and track PR creation

## 📁 Working Directory Structure

```
~/SwarmStation/
└── agents/
    ├── facebook-react/
    │   ├── issue-123/        # Each issue gets its own clone
    │   ├── issue-456/
    │   └── issue-789/
    └── your-org-your-repo/
        └── issue-303/
```

## ⚙️ Configuration

### Environment Variables

```bash
# Custom agents directory (default: ~/SwarmStation/agents)
export SWARMSTATION_AGENTS_DIR="/path/to/agents"

# Maximum concurrent agents (default: 5)
export SWARMSTATION_MAX_AGENTS=10

# Enable debug logging
export SWARMSTATION_DEBUG=true
```

### Application Settings

Access via the gear icon in the UI:
- **Max Concurrent Agents**: Limit simultaneous deployments (1-20)
- **Auto-refresh Issues**: Keep issue list updated
- **Show Agent Logs**: Display real-time output
- **Clean Working Directories**: Auto-cleanup after PR creation

## 🔧 Usage Examples

### Deploy Multiple Agents

```bash
# Select issues #123, #456, and #789 in the UI
# Click "Deploy Agents"
# SwarmStation will:
# - Spawn 3 Claude agents simultaneously
# - Each works in isolated directories
# - Creates separate branches and PRs
```

### Bulk Issue Creation

Use natural language to create multiple issues at once:

```
Fix the login bug where users can't reset passwords
Add dark mode to settings - high priority
Update API docs for v2
Dashboard is slow with 1000+ items
```

SwarmStation automatically:
- Detects issue types (bug, feature, docs, performance)
- Assigns appropriate labels and priorities
- Formats descriptions with acceptance criteria

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

### Code Style

- TypeScript for new components
- Follow existing patterns for consistency
- Add tests for new features
- Update documentation as needed

## 🐛 Troubleshooting

### Agents Not Starting

1. Verify CLI tools are installed:
   ```bash
   claude --version
   gh auth status
   ```

2. Check repository permissions
3. Review agent logs for specific errors

### Debug Mode

```bash
SWARMSTATION_DEBUG=true npm start
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/) for cross-platform desktop support
- Powered by [Claude AI](https://claude.ai) for autonomous development
- Integrates with [GitHub CLI](https://cli.github.com) for repository management

## 📊 Status

SwarmStation is actively maintained and under continuous development. Check our [releases page](https://github.com/yourusername/swarmstation/releases) for the latest updates.

---

<p align="center">
  Made with ❤️ by the SwarmStation team
</p>