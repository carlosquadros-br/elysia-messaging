# Roadmap: elysia-messaging

Planejamento de evolução seguindo semver e mantendo compatibilidade.

---

## v0.1.0 - MVP (Initial Release) 🎯

**Objetivo:** Plugin funcional com type-safety básico e Redis Streams.

### Features
- ✅ `createTopicRegistry()` com TypeBox schemas
- ✅ `messaging()` plugin para publishers
- ✅ `messagingConsumers()` plugin para workers
- ✅ `createConsumer()` type-safe
- ✅ Validação automática de payloads
- ✅ Redis Streams adapter (bus + consumer)
- ✅ Dedupe store para idempotency
- ✅ Hooks básicos: onPublish, onError, onMessage
- ✅ Lifecycle integrado (onStart/onStop)
- ✅ Documentação completa

### Limitações
- ⚠️ Apenas TypeBox para validação
- ⚠️ Sem retry/DLQ implementation (adapter responsibility)
- ⚠️ Sem métricas built-in
- ⚠️ Sem message batching

### Breaking Changes
- Nenhum (primeira versão)

### Migration Guide
N/A

---

## v0.2.0 - Multi-Validator + Observability 📊

**Objetivo:** Suporte para Zod e sistema de observabilidade robusto.

### Features
- 🆕 Zod validator support
  ```typescript
  import { z } from 'zod'
  import { zodValidator } from 'elysia-messaging/validators/zod'
  
  const registry = createTopicRegistry(
    { 'user.created': { schema: z.object({ userId: z.string().uuid() }) } },
    { validator: zodValidator }
  )
  ```

- 🆕 Métricas built-in (opcional)
  ```typescript
  messaging({
    registry,
    bus,
    metrics: {
      provider: 'prometheus', // ou 'datadog', 'custom'
      labels: ['topic', 'status'],
    },
  })
  ```

- 🆕 Hooks adicionais
  - `onValidationError`
  - `onDedupe` (quando mensagem é pulada por idempotency)
  - `beforePublish` (para transformar payload)

- 🆕 Metadata no envelope
  ```typescript
  await messaging.publish('video.jobs', payload, {
    metadata: { source: 'api', userId: '123' },
  })
  ```

### Breaking Changes
- ❌ **NENHUM** (backward compatible)

### Deprecations
- Nenhuma

### Migration Guide
- Tudo funciona como antes
- Novos features são opt-in

---

## v0.3.0 - Advanced Patterns 🚀

**Objetivo:** Suporte para patterns avançados de mensageria.

### Features
- 🆕 Message batching
  ```typescript
  await messaging.publishBatch('video.jobs', [
    { videoId: '1', url: '...' },
    { videoId: '2', url: '...' },
  ])
  ```

- 🆕 Delayed messages
  ```typescript
  await messaging.publish('reminder', payload, {
    delayMs: 3600000, // 1 hora depois
  })
  ```

- 🆕 Message scheduling (cron-like)
  ```typescript
  messaging.schedule('daily-report', '0 0 * * *', async () => {
    return { date: new Date().toISOString() }
  })
  ```

- 🆕 Consumer scaling helpers
  ```typescript
  createConsumerPool(registry, {
    topic: 'video.jobs',
    group: 'workers',
    minConsumers: 2,
    maxConsumers: 10,
    autoScale: true,
  })
  ```

- 🆕 Dead Letter Queue inspection
  ```typescript
  const dlqMessages = await messaging.inspectDLQ('video.jobs')
  await messaging.replayFromDLQ('video.jobs', messageId)
  ```

### Breaking Changes
- ⚠️ `ConsumerOptions.retryDelayMs` agora aceita function:
  ```typescript
  // Antes (v0.2)
  retryDelayMs: 1000
  
  // Depois (v0.3) - backward compatible
  retryDelayMs: 1000 // ainda funciona
  retryDelayMs: (attempt) => Math.min(1000 * 2 ** attempt, 60000) // exponential backoff
  ```

### Deprecations
- Nenhuma (apenas adições)

### Migration Guide
- Tudo funciona como antes
- `retryDelayMs` aceita ambos (number ou function)

---

## v0.4.0 - Multi-Broker Production Ready 🏭

**Objetivo:** Suporte robusto para NATS, Kafka, RabbitMQ.

### Features
- 🆕 NATS adapter
  ```typescript
  import { NATSStreamsBus, NATSConsumer } from 'elysia-messaging/nats'
  
  messaging({ registry, bus: new NATSStreamsBus(natsClient) })
  ```

- 🆕 Kafka adapter
  ```typescript
  import { KafkaBus, KafkaConsumer } from 'elysia-messaging/kafka'
  
  messaging({ registry, bus: new KafkaBus(kafkaClient) })
  ```

- 🆕 RabbitMQ adapter
  ```typescript
  import { RabbitMQBus, RabbitMQConsumer } from 'elysia-messaging/rabbitmq'
  
  messaging({ registry, bus: new RabbitMQBus(amqpConnection) })
  ```

- 🆕 BusResolver estratégias predefinidas
  ```typescript
  import { topicPrefixResolver } from 'elysia-messaging/resolvers'
  
  messaging({
    registry,
    busResolver: topicPrefixResolver({
      'video.*': redisBus,
      'email.*': natsBus,
      'event.*': kafkaBus,
      default: redisBus,
    }),
  })
  ```

- 🆕 Health checks
  ```typescript
  app.get('/health', ({ messaging }) => ({
    messaging: messaging.healthCheck(),
    // { bus: 'healthy', dedupe: 'healthy' }
  }))
  ```

### Breaking Changes
- ❌ **NENHUM** (só adições)

### Migration Guide
- Tudo funciona como antes
- Novos adapters são opt-in

---

## v0.5.0 - Testing & DevEx 🧪

**Objetivo:** Ferramentas para testing e melhor developer experience.

### Features
- 🆕 In-memory adapter para testes
  ```typescript
  import { InMemoryBus, InMemoryConsumer } from 'elysia-messaging/testing'
  
  const bus = new InMemoryBus()
  const consumer = new InMemoryConsumer()
  
  // Útil para testes unitários
  await bus.publish('video.jobs', payload)
  expect(bus.getPublishedMessages('video.jobs')).toHaveLength(1)
  ```

- 🆕 CLI para inspecionar mensagens
  ```bash
  npx elysia-messaging inspect video.jobs --last 10
  npx elysia-messaging replay video.jobs --from-dlq
  npx elysia-messaging monitor --topics video.*
  ```

- 🆕 Schema versioning helpers
  ```typescript
  const registry = createVersionedRegistry({
    'user.created': {
      v1: { schema: t.Object({ userId: t.String() }) },
      v2: { schema: t.Object({ userId: t.String(), email: t.String() }) },
      current: 'v2',
      migrate: (v1Data) => ({ ...v1Data, email: 'unknown@example.com' }),
    },
  })
  ```

- 🆕 Type generation para outros languages
  ```bash
  npx elysia-messaging codegen --lang python --output ./types.py
  # Gera tipos Python baseado no registry TypeScript
  ```

### Breaking Changes
- ❌ **NENHUM**

### Migration Guide
- Tudo funciona como antes
- Novos features são opt-in

---

## v1.0.0 - Stable Release 🎉

**Objetivo:** API estável, battle-tested, production-ready.

### Features
- ✅ API estável (semver garantido)
- ✅ Documentação completa
- ✅ Exemplos para todos adapters
- ✅ Performance benchmarks
- ✅ Security audit
- ✅ Comprehensive test suite (>90% coverage)

### Breaking Changes (migration de 0.x → 1.0)

#### 1. Registry agora requer explicit validator
```typescript
// Antes (v0.x) - validator padrão era TypeBox
const registry = createTopicRegistry({ ... })

// Depois (v1.0) - precisa especificar
import { typeBoxValidator } from 'elysia-messaging/validators'

const registry = createTopicRegistry(
  { ... },
  { validator: typeBoxValidator }
)
```

**Motivo:** Explícito é melhor que implícito. Evita surpresas com validação.

#### 2. Hooks são async-first
```typescript
// Antes (v0.x) - hooks podiam ser sync ou async
hooks: {
  onPublish: (topic, envelope) => { console.log('sync') },
}

// Depois (v1.0) - todos hooks devem ser async
hooks: {
  onPublish: async (topic, envelope) => { console.log('async') },
}
```

**Motivo:** Consistência. Evita bugs com sync hooks que fazem operações assíncronas.

#### 3. ConsumerOptions.maxRetries default mudou
```typescript
// Antes (v0.x) - default era 3
const consumer = createConsumer(registry, { ... })

// Depois (v1.0) - default é 5
const consumer = createConsumer(registry, {
  options: { maxRetries: 3 }, // se quiser manter comportamento antigo
})
```

**Motivo:** 5 retries é mais robusto para casos transientes (network glitches).

### Migration Guide (0.x → 1.0)

**Passo 1:** Adicionar validator explícito
```typescript
import { typeBoxValidator } from 'elysia-messaging/validators'

const registry = createTopicRegistry(topics, { validator: typeBoxValidator })
```

**Passo 2:** Tornar hooks async
```typescript
hooks: {
  onPublish: async (topic, envelope) => {
    // seu código
  },
}
```

**Passo 3:** Revisar maxRetries se necessário
```typescript
createConsumer(registry, {
  options: { maxRetries: 3 }, // se quiser voltar ao comportamento v0.x
})
```

**Passo 4:** Rodar testes

---

## v1.1.0+ - Future Ideas 💡

Possíveis features pós-1.0 (não garantidas):

- Event Sourcing helpers
- CQRS patterns
- Saga orchestration
- GraphQL subscriptions integration
- Temporal.io integration
- OpenTelemetry tracing automático
- Schema registry (Confluent/Apicurio)
- Multi-tenancy support
- Rate limiting per topic
- Priority queues

---

## Estratégia de Compatibilidade

### Semver Strict
- **Patch (1.0.x):** Apenas bug fixes, sem API changes
- **Minor (1.x.0):** Novos features, backward compatible
- **Major (2.0.0):** Breaking changes (evitar ao máximo)

### Deprecation Policy
- Feature será marcada como deprecated por 2 minor versions antes de remover
- Warnings no console quando feature deprecated é usada
- Migration guide detalhado antes de major bump

### LTS Support
- v1.x será mantida por 2 anos após v2.0 lançar
- Security patches por 3 anos
- Critical bugs por 2 anos

---

## Contribuições

Roadmap é flexível baseado em feedback da comunidade.

**Como sugerir features:**
1. Abrir issue com tag `feature-request`
2. Descrever use case e problema que resolve
3. Propor API design
4. Discutir trade-offs

**Priorização:**
- 🔥 P0: Blockers para production
- 🚀 P1: Muito solicitado pela comunidade
- 💡 P2: Nice to have
- 🧪 P3: Experimental

