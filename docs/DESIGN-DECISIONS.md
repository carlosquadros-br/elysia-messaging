# Design Decisions & Trade-offs

## Arquitetura: TopicRegistry como Fundação

### ✅ Decisão: Registry-First Design

**Escolha:** Todo o sistema de tipos gira em torno do `TopicRegistry<TTopics>`, que mapeia topic names → schemas.

**Vantagens:**
- **Type Inference Total:** O TypeScript infere automaticamente o tipo do payload baseado no topic
- **Single Source of Truth:** Schema e messageType definidos em um único lugar
- **Refactoring Seguro:** Renomear topic ou mudar schema quebra em compile-time
- **Autocomplete:** IDE sugere topics válidos e payloads corretos

**Trade-off:**
- ❌ Complexidade inicial: usuário precisa entender o conceito de registry
- ❌ Boilerplate: precisa criar o registry antes de usar
- ✅ **Decisão:** Vale a pena pela segurança de tipos e DX a longo prazo

**Exemplo do problema que resolve:**
```typescript
// ❌ Sem registry: sem type-safety
await messaging.publish('video.jobs', { wrong: 'payload' }) // compila mas falha em runtime

// ✅ Com registry: erro em compile-time
await messaging.publish('video.jobs', { wrong: 'payload' })
//                                      ^^^^^^^^^^^^^^^^^^
// Error: Type '{ wrong: string }' is not assignable to type '{ videoId: string, url: string }'
```

---

## Sistema de Validação: Abstração vs Acoplamento

### ✅ Decisão: SchemaValidator Abstraction

**Escolha:** Interface `SchemaValidator` que desacopla do TypeBox/Zod.

**Vantagens:**
- **Flexibilidade:** Suporta TypeBox, Zod, Yup, AJV, ou validador custom
- **Portabilidade:** Usuário escolhe a lib de validação que já usa
- **Extensibilidade:** Fácil adicionar novos validadores

**Trade-off:**
- ❌ Tipagem mais complexa: `Static<TSchema>` precisa funcionar com múltiplos tipos
- ❌ Não aproveitamos features específicas (ex: Zod transforms, TypeBox refs)
- ✅ **Decisão:** Aceitável, pois 90% dos casos são schemas simples

**Implementação:**
```typescript
export interface SchemaValidator {
  validate<TSchema>(schema: TSchema, data: unknown): asserts data is Static<TSchema>
  validateAsync?<TSchema>(schema: TSchema, data: unknown): Promise<void>
  isValid?<TSchema>(schema: TSchema, data: unknown): boolean
}

// Usuário pode usar Zod:
const zodValidator: SchemaValidator = {
  validate: (schema, data) => schema.parse(data),
}

// Ou TypeBox:
const typeBoxValidator: SchemaValidator = {
  validate: (schema, data) => Value.Check(schema, data),
}
```

---

## Consumer Lifecycle: Plugin vs Manual

### ✅ Decisão: Lifecycle Integrado ao Elysia

**Escolha:** Consumers iniciam no `onStart` e param no `onStop` automaticamente.

**Vantagens:**
- **Zero Config:** Usuário não precisa gerenciar start/stop manualmente
- **Graceful Shutdown:** Para automaticamente quando o app desliga
- **Testabilidade:** Fácil testar com lifecycle do Elysia

**Trade-off:**
- ❌ Menos controle: não dá para iniciar consumers sob demanda
- ❌ Acoplamento: consumers são parte do app lifecycle
- ✅ **Decisão:** Correto para 99% dos casos. Se precisar controle manual, usuário pode usar o adapter diretamente

**Alternativa rejeitada:**
```typescript
// ❌ Controle manual (mais complexo)
const consumer = app.consumers.start('video.jobs')
await consumer.stop()

// ✅ Automático (simples)
app.use(messagingConsumers({ consumers: [...] }))
// Inicia automaticamente quando app.listen()
```

---

## Multi-Broker: Resolver vs Multiple Instances

### ✅ Decisão: BusResolver Function

**Escolha:** Aceitar `bus: MessageBus | BusResolver` para escolher bus por topic.

**Vantagens:**
- **Flexibilidade:** Roteamento por padrão (ex: `video.*` → Redis, `notification.*` → NATS)
- **Performance:** Usar o broker ideal para cada workload
- **Migração:** Migrar topics gradualmente de um broker para outro

**Trade-off:**
- ❌ Complexidade: usuário precisa entender quando usar resolver
- ❌ Runtime overhead: função executada a cada publish
- ✅ **Decisão:** Resolver é opt-in. Para 80% dos casos, um único bus é suficiente

**Exemplo:**
```typescript
// Caso simples (um bus)
messaging({ registry, bus: redisBus })

// Caso avançado (multi-broker)
messaging({
  registry,
  busResolver: (topic) => {
    if (topic.startsWith('video.')) return redisBus
    if (topic.startsWith('email.')) return natsBus
    return redisBus // default
  },
})
```

---

## Observabilidade: Hooks vs Events

### ✅ Decisão: Hooks Callback-Based

**Escolha:** Hooks síncronos/assíncronos passados no config.

**Vantagens:**
- **Simples:** Callbacks inline, sem EventEmitter
- **Type-Safe:** Hooks tipados com topic e envelope
- **Zero Deps:** Não precisamos de lib de eventos

**Trade-off:**
- ❌ Não dá para adicionar hooks dinamicamente depois de criar o plugin
- ❌ Todos os hooks executam sequencialmente (potencial gargalo)
- ✅ **Decisão:** Hooks são configuração estática, o que é correto. Se precisar eventos dinâmicos, usuário implementa dentro dos hooks

**Exemplo:**
```typescript
messaging({
  registry,
  bus,
  hooks: {
    onPublish: async (topic, envelope) => {
      metrics.increment('messages.published', { topic })
      await tracing.trace(envelope.correlationId, 'publish', { topic })
    },
    onPublishError: async (topic, envelope, error) => {
      sentry.captureException(error, { topic, eventId: envelope.eventId })
    },
  },
})
```

**Por que não EventEmitter:**
```typescript
// ❌ Alternativa rejeitada (mais complexo)
messaging.on('publish', (topic, envelope) => { ... })
messaging.emit('publish', topic, envelope)

// ✅ Hooks são mais diretos
hooks: { onPublish: (topic, envelope) => { ... } }
```

---

## Idempotency: Opt-In vs Always On

### ✅ Decisão: Opt-In per Consumer

**Escolha:** `options.idempotency: boolean` (default false).

**Vantagens:**
- **Performance:** Não consulta Redis em todo consumer
- **Flexibilidade:** Usuário decide onde precisa idempotency
- **Explícito:** Fica claro no código que idempotency está ativo

**Trade-off:**
- ❌ Risco: usuário esquece de habilitar e processa mensagens duplicadas
- ❌ Inconsistente: alguns consumers com, outros sem
- ✅ **Decisão:** Idempotency tem custo (latência + Redis calls). Deixar opt-in é correto.

**Recomendação:** Documentar quando habilitar:
```typescript
// ✅ Habilite idempotency se:
// - Handler não é naturalmente idempotente (ex: insert no banco)
// - Mensagens podem ser redelivered (ex: falha de ack)
// - Consumer pode processar a mesma mensagem múltiplas vezes

createConsumer(registry, {
  topic: 'payment.completed',
  options: {
    idempotency: true, // ✅ Critical: não processar pagamento 2x
  },
  async handler(envelope) {
    await chargeCustomer(envelope.payload.amount)
  },
})
```

---

## Tipagem: Complexidade vs Type-Safety

### ⚠️ Trade-off: Tipos Genéricos Aninhados

**Problema:** Para inferir `TopicPayload<TRegistry, TTopic>`, precisamos de generics aninhados:

```typescript
export type TopicPayload<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
> = TRegistry['topics'][TTopic]['schema'] extends TSchema
  ? Static<TRegistry['topics'][TTopic]['schema']>
  : never
```

**Custo:**
- ❌ **Complexidade:** Tipos difíceis de ler para contributors
- ❌ **Performance:** TypeScript pode ser lento em projetos grandes
- ❌ **Error Messages:** Mensagens de erro do TS podem ser crípticas

**Benefício:**
- ✅ **Type-Safety Total:** Usuário não consegue publicar payload errado
- ✅ **Autocomplete Perfeito:** IDE sugere exatamente o que o schema espera
- ✅ **Refactoring:** Mudar schema quebra em compile-time

**Decisão:** ✅ **Vale a pena**. Tipos complexos ficam "escondidos" nos helpers. Usuário final vê API simples.

**Experiência do usuário final:**
```typescript
// Usuário não vê os tipos complexos, só o resultado:
await messaging.publish('video.jobs', {
  //                                  ^ IDE autocompleta os campos corretos
  videoId: '123',
  url: 'https://...',
})
```

---

## API Design: Dois Plugins vs Um Plugin

### ✅ Decisão: Separar Client (publish) de Consumers (subscribe)

**Escolha:** `messaging()` e `messagingConsumers()` são plugins separados.

**Vantagens:**
- **Separação de Concerns:** API server não precisa importar consumer logic
- **Deployment Flexível:** Mesma codebase, apps diferentes (API vs Worker)
- **Bundle Size:** Tree-shaking remove código não usado
- **Performance:** Workers não carregam código de rotas HTTP

**Trade-off:**
- ❌ Dois imports: usuário precisa importar ambos se usar ambos
- ❌ Registry duplicado: mesma definição em API e Worker
- ✅ **Decisão:** Correto. Na prática, API e Worker são processos separados

**Padrão recomendado:**
```typescript
// shared/topics.ts (compartilhado entre API e Worker)
export const myTopics = createTopicRegistry({ ... })

// api/index.ts (só publishing)
import { messaging } from 'elysia-messaging'
import { myTopics } from '../shared/topics'

const api = new Elysia()
  .use(messaging({ registry: myTopics, bus }))
  .post('/publish', ...)

// worker/index.ts (só consuming)
import { messagingConsumers, createConsumer } from 'elysia-messaging'
import { myTopics } from '../shared/topics'

const worker = new Elysia()
  .use(messagingConsumers({ registry: myTopics, consumers: [...] }))
```

---

## Validator: Sync vs Async

### ⚠️ Decisão: Suportar Ambos

**Escolha:** `validate()` e `validateAsync()` no `SchemaValidator`.

**Problema:** Validação pode ser síncrona (TypeBox, AJV) ou assíncrona (custom validators com DB lookup).

**Solução:**
```typescript
export interface SchemaValidator {
  validate<TSchema>(schema: TSchema, data: unknown): asserts data is Static<TSchema>
  validateAsync?<TSchema>(schema: TSchema, data: unknown): Promise<void>
}
```

**Estratégia:**
- Se `validateAsync` existe, usa ela
- Senão, usa `validate` (sync)
- Publisher/Consumer tentam async primeiro, fallback para sync

**Trade-off:**
- ❌ Complexidade: precisa lidar com ambos
- ✅ Flexibilidade: suporta todos os validadores

---

## Resumo de Decisões

| Decisão | Trade-off | Justificativa |
|---------|-----------|---------------|
| **Registry-First** | Boilerplate inicial | Type-safety vale a pena |
| **SchemaValidator abstraction** | Tipagem complexa | Suporta múltiplas libs |
| **Lifecycle integrado** | Menos controle manual | Simples para 99% dos casos |
| **BusResolver** | Runtime overhead | Flexibilidade multi-broker |
| **Hooks callbacks** | Não dinâmico | Simples e type-safe |
| **Idempotency opt-in** | Risco de esquecer | Performance vs segurança |
| **Tipos genéricos aninhados** | Complexidade interna | DX perfeita para usuário |
| **Dois plugins separados** | Dois imports | Separação de concerns |
| **Sync + Async validation** | Complexidade | Suporta todos validadores |

---

## Quando Simplificar vs Quando Complexificar

### Simplificar (80% dos casos):
- Um único bus
- Topics simples sem messageType
- Validação com TypeBox
- Um consumer por topic
- Sem idempotency

### Complexificar (20% dos casos):
- Multi-broker com resolver
- Topics com messageType e versioning
- Validação custom (Zod, Yup)
- Múltiplos consumers (load balancing)
- Idempotency crítica

**API permite ambos sem forçar complexidade.**

