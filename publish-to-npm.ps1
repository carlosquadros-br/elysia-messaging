# Script para publicar elysia-messaging no npm
# Execute: .\publish-to-npm.ps1

Write-Host "`n🚀 Publicando elysia-messaging v0.3.0 no npm...`n" -ForegroundColor Cyan

# 1. Build
Write-Host "📦 Building package..." -ForegroundColor Yellow
npm run clean
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful`n" -ForegroundColor Green

# 2. Verificar o que será publicado
Write-Host "📋 Files to be published:" -ForegroundColor Yellow
npm pack --dry-run

Write-Host "`n"
$confirm = Read-Host "Continue with git commit and publish? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "❌ Aborted by user" -ForegroundColor Red
    exit 0
}

# 3. Git commit
Write-Host "`n📝 Committing changes..." -ForegroundColor Yellow
git add .
git commit -m "feat: implement Redis Streams adapters (v0.3.0)

- Implement RedisStreamsBus.publish() with XADD
- Implement RedisStreamsConsumer.subscribe() with XREADGROUP  
- Implement RedisDedupeStore with Redis SET
- Add consumer group creation
- Add ACK handling
- Add retry logic and DLQ support
- Add batch processing (10 messages per batch)

BREAKING CHANGE: Redis Streams adapters moved to subpath export
Import with: import { RedisStreamsBus } from 'elysia-messaging/redis-streams'"

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n⚠️  Git commit failed (maybe no changes?)" -ForegroundColor Yellow
}

# 4. Create tag
Write-Host "`n🏷️  Creating tag v0.3.0..." -ForegroundColor Yellow
git tag -f v0.3.0
git push origin main --force-with-lease
git push origin v0.3.0 --force

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n⚠️  Git push failed" -ForegroundColor Yellow
    Write-Host "You may need to configure git remote or authenticate" -ForegroundColor Yellow
}

# 5. Check npm login
Write-Host "`n👤 Checking npm authentication..." -ForegroundColor Yellow
npm whoami

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n⚠️  Not logged in to npm" -ForegroundColor Yellow
    Write-Host "Please run: npm login" -ForegroundColor Yellow
    $loginNow = Read-Host "Login now? (y/n)"
    if ($loginNow -eq 'y') {
        npm login
    } else {
        Write-Host "❌ Cannot publish without npm authentication" -ForegroundColor Red
        exit 1
    }
}

# 6. Publish
Write-Host "`n📤 Publishing to npm..." -ForegroundColor Yellow
Write-Host "This will publish: elysia-messaging@0.3.0" -ForegroundColor Cyan

$confirmPublish = Read-Host "Publish now? (y/n)"
if ($confirmPublish -ne 'y') {
    Write-Host "❌ Publish aborted" -ForegroundColor Red
    exit 0
}

npm publish --access public

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Publish failed!" -ForegroundColor Red
    Write-Host "Check the error above for details" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✅ Successfully published elysia-messaging@0.3.0 to npm!" -ForegroundColor Green
Write-Host "`n📦 Package available at: https://www.npmjs.com/package/elysia-messaging" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. cd ..\elysia-messaging-example" -ForegroundColor White
Write-Host "  2. Remove-Item -Recurse -Force node_modules" -ForegroundColor White
Write-Host "  3. bun install" -ForegroundColor White
Write-Host "  4. bun run api" -ForegroundColor White
Write-Host "`n🎉 Done!" -ForegroundColor Green

