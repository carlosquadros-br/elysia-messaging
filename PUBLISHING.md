# Publishing Guide

## Pre-Publishing Checklist

### ✅ Completed

- [x] Version bumped to 0.2.0
- [x] Description updated (broker-agnostic)
- [x] Exports simplified (ESM-only)
- [x] Files reduced (dist only, no src)
- [x] Redis adapters moved to subpath export
- [x] Clean script added
- [x] prepublishOnly script updated
- [x] Keywords updated

### 📋 Before Publishing

- [ ] Update README.md with new import paths
- [ ] Ensure LICENSE file exists
- [ ] Test build locally
- [ ] Test imports from both paths

---

## Publishing Commands

### 1. Verify Everything Works

```bash
# Clean build
npm run clean
npm run build

# Check what will be published
npm pack
tar -tf elysia-messaging-0.2.0.tgz

# Should see:
# - package/dist/...
# - package/README.md
# - package/LICENSE
# - package/UPGRADE-GUIDE.md
# - package/package.json
```

### 2. Test Imports Locally

Create a test file outside the package:

```typescript
// Test core imports
import { 
  messaging, 
  messagingConsumers,
  createTopicRegistry,
  createConsumer,
  createConsumerFromClass,
  typeBoxValidator,
  ValidationError,
} from 'elysia-messaging'

// Test subpath imports
import { 
  RedisStreamsBus, 
  RedisStreamsConsumer, 
  RedisDedupeStore 
} from 'elysia-messaging/redis-streams'
```

You can test using `npm link`:

```bash
# In elysia-messaging directory
npm link

# In test project
npm link elysia-messaging
```

### 3. Commit Changes

```bash
git add .
git commit -m "chore: release v0.2.0 - production-grade refactor

- Implement TypeBox validation
- Add enhanced handler context with messaging injection
- Support OO consumer pattern
- Add dynamic group/name resolution
- Auto-pick messageType from registry
- Move Redis adapters to subpath export
- Update to ESM-only exports"
```

### 4. Login to npm

```bash
# Login (first time)
npm login

# Verify
npm whoami
```

### 5. Publish

```bash
# Dry run (see what would be published)
npm publish --dry-run

# Actually publish
npm publish --access public
```

### 6. Create Git Tag

```bash
git tag v0.2.0
git push origin main --tags
```

### 7. Create GitHub Release

Go to GitHub → Releases → Create new release:

- Tag: `v0.2.0`
- Title: `v0.2.0 - Production-Grade Refactor`
- Description: Copy from UPGRADE-GUIDE.md summary

---

## After Publishing

### Update Documentation

1. **README.md** - Update import examples:

```typescript
// Core imports
import { messaging, messagingConsumers } from 'elysia-messaging'

// Redis Streams adapter (subpath)
import { RedisStreamsBus } from 'elysia-messaging/redis-streams'
```

2. **Installation instructions:**

```bash
# Core package
npm install elysia-messaging @sinclair/typebox

# If using Redis Streams
npm install ioredis
```

### Verify Published Package

```bash
# Check on npm
npm view elysia-messaging

# Install in fresh project
mkdir test-install && cd test-install
npm init -y
npm install elysia-messaging
```

Test imports:

```typescript
import { messaging } from 'elysia-messaging'
import { RedisStreamsBus } from 'elysia-messaging/redis-streams'
```

### Announce

- Tweet about release
- Post in Elysia Discord
- Update any dependent projects

---

## Import Path Changes (Breaking for Users)

### Old (v0.1.0)

```typescript
import { 
  messaging,
  RedisStreamsBus, // ← Was in main export
} from 'elysia-messaging'
```

### New (v0.2.0)

```typescript
// Core (broker-agnostic)
import { messaging } from 'elysia-messaging'

// Redis adapter (subpath)
import { RedisStreamsBus } from 'elysia-messaging/redis-streams'
```

**Migration:** Users need to add the subpath import for Redis adapters. This is documented in UPGRADE-GUIDE.md.

---

## Rollback Plan

If something goes wrong:

```bash
# Unpublish within 72 hours
npm unpublish elysia-messaging@0.2.0

# Or deprecate
npm deprecate elysia-messaging@0.2.0 "Please use 0.1.0, issue found"

# Fix and republish as 0.2.1
```

---

## Future Improvements

### Separate Redis Adapter Package (Optional)

If you want completely clean separation:

1. Create new package: `elysia-messaging-redis-streams`
2. Move adapters there
3. Remove `ioredis` from main package
4. Document in README

For now, subpath export is good enough and keeps things simple.

---

## Package Size Check

After building:

```bash
# Check bundle size
du -sh dist/

# Should be < 100KB (excluding node_modules)
```

If too large, check for:
- Accidentally bundled dependencies
- Large example files (they should not be in dist)

---

## Support

If users report issues:

1. Check GitHub issues
2. Verify their import paths match new structure
3. Point to UPGRADE-GUIDE.md
4. Help migrate if needed

---

**Ready to publish?** Follow the steps above carefully. Good luck! 🚀

