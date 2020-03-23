import 'reflect-metadata'
import {ControllerOptions} from '@nestjs/common'
import {
  Extender,
  TRpcMethodParam,
  IParsedObject,
  parseJsonRpcObject,
  JSON_RPC_METADATA,
  TRpcMethodEntry,
} from '@qiwi/json-rpc-common'
import {JsonRpcController} from 'nestjs-json-rpc'
import {Request} from 'express'
import {SecurityLevel} from '../guards'
import {IMetaTypedValue} from '@qiwi/substrate'

export type TP3Meta = {
  securityLevel?: number
  clientType?: Array<string>
}
export type TP3RpcMethodEntry = TRpcMethodEntry & { meta: TP3Meta }

export type TSinapMeta = {
  auth?: string
  clientAuth?: string | string[]
  client?: {
    clientType: string
    clientId?: string
  }
  security?: {
    level: number
  }
}

type IP3MetaTypedValue = IMetaTypedValue<IParsedObject, 'jsonRpcP3', TSinapMeta>

export const P3Provider = (path: ControllerOptions | string): ClassDecorator => {
  return <TFunction extends Function> (target: TFunction) => {
    const extend: Extender = base => {
      @JsonRpcController(path)
      class JsonRpcBase extends base {}

      class Extended extends JsonRpcBase {

        static resolveParam(boxedP3JsonRpc: IP3MetaTypedValue, Param: any, {type}: TRpcMethodParam) {
          if (boxedP3JsonRpc.value.type !== 'request') {
            return
          }

          const {value, meta} = boxedP3JsonRpc
          const paramMap = {
            // @ts-ignore
            locale: value.payload.params?.locale,
            // @ts-ignore
            query: value.payload.params?.query,
            // @ts-ignore
            fields: value.payload.params?.fields,
            id: value.payload.id,
            client: meta.client,
            security: meta.security,
            auth: meta.auth,
            clientAuth: meta.clientAuth,
          }

          // @ts-ignore
          const data = paramMap[type]

          return typeof Param === 'function' ? new Param(data) : data
        }

        static parseRequest(req: Request): IP3MetaTypedValue | undefined {
          // @ts-ignore
          const jsonRpc = parseJsonRpcObject(req.body)

          if (Array.isArray(jsonRpc)) {
            // TODO
            return
          }

          return {
            meta: {
              client: req.body.client,
              security: req.body.security,
              auth: req.headers.authorization,
              clientAuth: req.headers['client-authorization'],
            },
            value: jsonRpc,
            type: 'jsonRpcP3',
          }
        }

        static resolveHandler(instance: Extended, boxedJsonRpc: IP3MetaTypedValue): {handler: Function, params: any[]} | {[key: string]: any} {
          if (Array.isArray(boxedJsonRpc.value)) {
            throw new Error('unexpected error')
          }

          if (boxedJsonRpc.value.type !== 'request') {
            throw new Error('unexpected error')
          }

          const _method = boxedJsonRpc.value.payload.method

          const meta = Reflect.getMetadata(JSON_RPC_METADATA, this) || {}
          const methodMeta: TP3RpcMethodEntry | undefined = (Object as any).values(meta)
            .find(({method, meta}: TP3RpcMethodEntry) => {
              if (_method !== method) {
                return
              }

              if ((meta?.securityLevel ?? SecurityLevel.INSECURE) > (boxedJsonRpc.meta.security?.level ?? SecurityLevel.INSECURE)) {
                return
              }

              if (meta?.clientType !== undefined && !(boxedJsonRpc.meta.client?.clientType && meta?.clientType.includes(boxedJsonRpc.meta.client?.clientType))) {
                return
              }

              return true
            })

          if (!methodMeta) {
            return {}
          }

          const propKey = methodMeta.key + ''
          const handler = this.prototype[propKey]
          const paramTypes = Reflect.getMetadata('design:paramtypes', instance, propKey)
          const params = (methodMeta.params || []).map((param: TRpcMethodParam, index: number) => {
            return this.resolveParam(boxedJsonRpc, paramTypes[index], param)
          })

          return {
            params,
            handler,
          }
        }

      }

      return Extended
    }

    return extend(target as any)
  }
}
