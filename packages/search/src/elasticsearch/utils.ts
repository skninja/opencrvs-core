/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * OpenCRVS is also distributed under the terms of the Civil Registration
 * & Healthcare Disclaimer located at http://opencrvs.org/license.
 *
 * Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.
 */
import { MATCH_SCORE_THRESHOLD, USER_MANAGEMENT_URL } from '@search/constants'
import { searchByCompositionId } from '@search/elasticsearch/dbhelper'
import { client, ISearchResponse } from '@search/elasticsearch/client'

import fetch from 'node-fetch'
import {
  searchForBirthDuplicates,
  searchForDeathDuplicates
} from '@search/features/registration/deduplicate/service'
import {
  findTaskHistories,
  getBusinessStatus,
  SavedBundle,
  SavedOffice,
  SavedPractitioner,
  SavedTask
} from '@opencrvs/commons/types'
import { findName } from '@search/features/fhir/fhir-utils'

export const enum EVENT {
  BIRTH = 'Birth',
  DEATH = 'Death',
  MARRIAGE = 'Marriage'
}

export const IN_PROGRESS_STATUS = 'IN_PROGRESS'
export const ARCHIVED_STATUS = 'ARCHIVED'
export const DECLARED_STATUS = 'DECLARED'
export const REJECTED_STATUS = 'REJECTED'
export const VALIDATED_STATUS = 'VALIDATED'
const WAITING_VALIDATION_STATUS = 'WAITING_VALIDATION'
export const REGISTERED_STATUS = 'REGISTERED'
const REINSTATED_STATUS = 'REINSTATED'
export const CERTIFIED_STATUS = 'CERTIFIED'
export const ISSUED_STATUS = 'ISSUED'
const REQUESTED_CORRECTION_STATUS = 'REQUESTED_CORRECTION'
const DECLARATION_UPDATED_STATUS = 'DECLARATION_UPDATED'

export const NOTIFICATION_TYPES = ['birth-notification', 'death-notification']
export const NAME_EN = 'en'

const validStatusMapping = {
  [ARCHIVED_STATUS]: [
    DECLARED_STATUS,
    REJECTED_STATUS,
    VALIDATED_STATUS
  ] as const,
  [IN_PROGRESS_STATUS]: [null] as const,
  [DECLARED_STATUS]: [ARCHIVED_STATUS, null] as const,
  [REJECTED_STATUS]: [
    DECLARED_STATUS,
    IN_PROGRESS_STATUS,
    WAITING_VALIDATION_STATUS,
    VALIDATED_STATUS,
    ARCHIVED_STATUS
  ] as const,
  [VALIDATED_STATUS]: [
    DECLARED_STATUS,
    IN_PROGRESS_STATUS,
    REJECTED_STATUS,
    ARCHIVED_STATUS,
    DECLARATION_UPDATED_STATUS,
    null
  ] as const,
  [WAITING_VALIDATION_STATUS]: [
    null,
    DECLARED_STATUS,
    IN_PROGRESS_STATUS,
    REJECTED_STATUS,
    VALIDATED_STATUS,
    DECLARATION_UPDATED_STATUS
  ] as const,
  [REGISTERED_STATUS]: [
    null,
    DECLARED_STATUS,
    IN_PROGRESS_STATUS,
    REJECTED_STATUS,
    VALIDATED_STATUS,
    WAITING_VALIDATION_STATUS
  ] as const,
  [CERTIFIED_STATUS]: [REGISTERED_STATUS, ISSUED_STATUS] as const,
  [ISSUED_STATUS]: [CERTIFIED_STATUS] as const,
  [REQUESTED_CORRECTION_STATUS]: [REGISTERED_STATUS, CERTIFIED_STATUS] as const,
  [REINSTATED_STATUS]: [ARCHIVED_STATUS] as const
}

export interface ICorrection {
  section: string
  fieldName: string
  oldValue: string
  newValue: string | number | boolean
}

export interface IAssignment {
  practitionerId: string
  firstName: string
  lastName: string
  officeName: string
}

export interface IOperationHistory {
  operationType: keyof typeof validStatusMapping
  operatedOn: string
}

export interface SearchDocument {
  compositionId: string
  compositionType?: string
  event?: EVENT
  type?: string
  informantType?: string
  contactNumber?: string
  contactEmail?: string
  dateOfDeclaration?: string
  trackingId?: string
  registrationNumber?: string
  eventLocationId?: string
  eventJurisdictionIds?: string[]
  eventCountry?: string
  declarationLocationId?: string
  declarationJurisdictionIds?: string[]
  rejectReason?: string
  rejectComment?: string
  relatesTo?: string[]
  childFirstNames?: string
  childFamilyName?: string
  childFirstNamesLocal?: string
  motherFirstNames?: string
  motherFamilyName?: string
  motherDoB?: string
  motherIdentifier?: string
  childDoB?: string
  childIdentifier?: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  modifiedAt?: string
  assignment?: IAssignment | null
  operationHistories?: IOperationHistory[]
}

export interface BirthDocument extends SearchDocument {
  childFirstNames?: string
  childMiddleName?: string
  childFamilyName?: string
  childFirstNamesLocal?: string
  childMiddleNameLocal?: string
  childFamilyNameLocal?: string
  childDoB?: string
  childIdentifier?: string
  gender?: string
  motherFirstNames?: string
  motherMiddleName?: string
  motherFamilyName?: string
  motherFirstNamesLocal?: string
  motherMiddleNameLocal?: string
  motherFamilyNameLocal?: string
  motherDoB?: string
  motherIdentifier?: string
  fatherFirstNames?: string
  fatherMiddleName?: string
  fatherFamilyName?: string
  fatherFirstNamesLocal?: string
  fatherMiddleNameLocal?: string
  fatherFamilyNameLocal?: string
  fatherDoB?: string
  fatherIdentifier?: string
  informantFirstNames?: string
  informantMiddleName?: string
  informantFamilyName?: string
  informantFirstNamesLocal?: string
  informantMiddleNameLocal?: string
  informantFamilyNameLocal?: string
  informantDoB?: string
  informantIdentifier?: string
}

export interface DeathDocument extends SearchDocument {
  deceasedFirstNames?: string
  deceasedMiddleName?: string
  deceasedFamilyName?: string
  deceasedFirstNamesLocal?: string
  deceasedMiddleNameLocal?: string
  deceasedFamilyNameLocal?: string
  deceasedDoB?: string
  gender?: string
  deceasedIdentifier?: string
  deathDate?: string
  motherFirstNames?: string
  motherMiddleName?: string
  motherFamilyName?: string
  motherFirstNamesLocal?: string
  motherMiddleNameLocal?: string
  motherFamilyNameLocal?: string
  fatherFirstNames?: string
  fatherMiddleName?: string
  fatherFamilyName?: string
  fatherFirstNamesLocal?: string
  fatherMiddleNameLocal?: string
  fatherFamilyNameLocal?: string
  spouseFirstNames?: string
  spouseMiddleName?: string
  spouseFamilyName?: string
  spouseFirstNamesLocal?: string
  spouseMiddleNameLocal?: string
  spouseFamilyNameLocal?: string
  spouseIdentifier?: string
  informantFirstNames?: string
  informantMiddleName?: string
  informantFamilyName?: string
  informantFirstNamesLocal?: string
  informantMiddleNameLocal?: string
  informantFamilyNameLocal?: string
  informantDoB?: string
  informantIdentifier?: string
}

export interface MarriageDocument extends SearchDocument {
  brideFirstNames?: string
  brideMiddleName?: string
  brideFamilyName?: string
  brideFirstNamesLocal?: string
  brideMiddleNameLocal?: string
  brideFamilyNameLocal?: string
  brideDoB?: string
  brideIdentifier?: string
  groomFirstNames?: string
  groomMiddleName?: string
  groomFamilyName?: string
  groomFirstNamesLocal?: string
  groomMiddleNameLocal?: string
  groomFamilyNameLocal?: string
  groomDoB?: string
  groomIdentifier?: string
  marriageDate?: string
  witnessOneFirstNames?: string
  witnessOneMiddleName?: string
  witnessOneFamilyName?: string
  witnessOneFirstNamesLocal?: string
  witnessOneMiddleNameLocal?: string
  witnessOneFamilyNameLocal?: string
  witnessTwoFirstNames?: string
  witnessTwoMiddleName?: string
  witnessTwoFamilyName?: string
  witnessTwoFirstNamesLocal?: string
  witnessTwoMiddleNameLocal?: string
  witnessTwoFamilyNameLocal?: string
}

type Label = {
  lang: string
  label: string
}

interface IUserRole {
  labels: Label[]
}

export interface IUserModelData {
  _id: string
  role: IUserRole
  name: fhir.HumanName[]
}

export async function detectBirthDuplicates(
  compositionId: string,
  body: BirthDocument
) {
  const searchResponse = await searchForBirthDuplicates(body, client)
  const duplicates = findDuplicateIds(searchResponse)
  return duplicates
}

export async function detectDeathDuplicates(
  compositionId: string,
  body: DeathDocument
) {
  const searchResponse = await searchForDeathDuplicates(body, client)
  const duplicates = findDuplicateIds(searchResponse)
  return duplicates
}

export async function getCreatedBy(compositionId: string) {
  const results = await searchByCompositionId(compositionId, client)
  const result = results?.body?.hits?.hits[0]?._source as SearchDocument
  return result?.createdBy
}

export const composeOperationHistories = (bundle: SavedBundle) => {
  const taskHistories = findTaskHistories(bundle)
  return taskHistories.map((taskHistory) => ({
    operationType: getBusinessStatus(taskHistory),
    operatedOn: taskHistory.lastModified
  }))
}

export const composeAssignment = (
  office: SavedOffice,
  practitioner: SavedPractitioner
) => {
  const practitionerName = findName(NAME_EN, practitioner.name)
  const practitionerFirstNames = practitionerName?.given?.join(' ') || ''
  const practitionerFamilyName = practitionerName?.family || ''

  return {
    practitionerId: practitioner.id,
    officeName: office.name!,
    firstName: practitionerFirstNames,
    lastName: practitionerFamilyName
  }
}

export const createStatusHistory = (body: SearchDocument, task: SavedTask) => {
  if (!isValidOperationHistory(body)) {
    return
  }

  const operationHistory = {
    operationType: body.type,
    operatedOn: task?.lastModified
  } as IOperationHistory

  body.operationHistories = body.operationHistories || []
  body.operationHistories.push(operationHistory)
}

export function findDuplicateIds(
  results: ISearchResponse<BirthDocument | DeathDocument>['hits']['hits']
) {
  return results
    .filter((hit) => hit._score > MATCH_SCORE_THRESHOLD)
    .map((hit) => ({
      id: hit._id,
      trackingId: hit._source.trackingId
    }))
}

export async function getUser(
  practitionerId: string,
  authHeader: any
): Promise<IUserModelData> {
  const res = await fetch(`${USER_MANAGEMENT_URL}getUser`, {
    method: 'POST',
    body: JSON.stringify({
      practitionerId
    }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader
    }
  })
  return await res.json()
}

function getPreviousStatus(body: BirthDocument) {
  if (body.operationHistories && body.operationHistories.length > 0) {
    return body.operationHistories[body.operationHistories.length - 1]
      .operationType
  }

  return null
}

export function isValidOperationHistory(body: BirthDocument) {
  const previousStatus = getPreviousStatus(body)
  const currentStatus = body.type as keyof typeof validStatusMapping

  if (
    currentStatus &&
    validStatusMapping[currentStatus] &&
    !validStatusMapping[currentStatus].includes(previousStatus as never)
  ) {
    return false
  }

  return true
}
