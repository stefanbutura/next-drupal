import type {
  SearchAppConfig,
  SearchAppData,
  SearchEngineResults,
} from '../types'
import type { DrupalNode } from 'next-drupal'
import type { NextRouter } from 'next/router'

import React from 'react'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'
import { useRouter } from 'next/router'
import { parse } from 'querystring'

import { deserialize } from './drupal'
import { applyFilter, getCurrentPage, queryHasConditions } from './search-utils'

const baseApiPath = '/api/drupal-search'

const initialData: SearchEngineResults = {
  data: [],
  // errors: [],
  items: [],
  jsonapi: {
    meta: {
      links: {
        self: {
          href: '',
        },
      },
    },
    version: '1.0',
  },
  meta: {
    count: 1,
    facets: [],
  },
}

const isClient = typeof window !== 'undefined'

// This solves the problem that on the client the router is initialized with an empty query
const getLocationSearch = (router: NextRouter): string => {
  let search
  if (isClient) {
    search = window.location.search
    const parsed = parse(search || '')
    search = parsed['?qs'] || ''
  } else {
    search = router.query.qs || ''
  }
  return search.toString()
}

const DEFAULT_PAGE_SIZE = '10'

const emptyQuery = {
  fields: {},
  filter: {
    // fulltext: undefined,
  },
  include: [],
  page: {
    limit: DEFAULT_PAGE_SIZE,
    offset: '0',
  },
  sort: [],
}

/**
 * Fetch the data for the search engine
 *
 * See documentation here:
 *
 * https://www.drupal.org/project/drupal_jsonapi_params
 * https://next-drupal.org/guides/search-api
 */
export const useSearchApp = (
  searchIndex: string,
  appConfig: SearchAppConfig,
): SearchAppData => {
  const router = useRouter()
  const qs = getLocationSearch(router)
  const djap = new DrupalJsonApiParams(qs)

  const currentQueryObject = djap.getQueryObject()

  const include = appConfig?.include ? appConfig.include : []
  const sort = appConfig?.sort ? appConfig.sort : {}

  const showListingOnInit = appConfig?.showListingOnInit ?? false

  // https://next-drupal.org/guides/jsonapi-params
  // Apply includes
  if (include && include.length > 0) {
    djap.addInclude(include)
  }

  // Apply default sort if no sort parameter is present
  // DECISIONS SORT
  if (
    !currentQueryObject.sort ||
    (currentQueryObject.sort.length === 0 && searchIndex === 'decisions')
  ) {
    if (currentQueryObject?.filter?.fulltext && sort?.relevance?.field) {
      djap.addSort(sort.relevance.field)
    } else {
      //taking the first item in sort object, if it exists
      if (sort && Object.keys(sort).length > 0) {
        const firstSortKey = Object.keys(sort)[0]
        const firstSortItem = sort[firstSortKey]
        if (firstSortItem && typeof firstSortItem.field === 'string') {
          djap.addSort(firstSortItem.field)
        }
      }
    }
  }

  // NEWS SORT
  if (searchIndex === 'news' && sort?.date?.field) {
    djap.addSort(sort.date.field)
  }
  if (searchIndex === 'news' && sort?.relevance?.field) {
    djap.addSort(sort.relevance.field)
  }

  // MEETINGS
  if (searchIndex === 'meetings') {
    //SORT
    if (sort?.date?.field) {
      djap.addSort(sort.date.field)
    }

    // MEETINGS DEFAULT DATE FILTER
    const formattedTomorrow = new Date(
      new Date().setDate(new Date().getDate() + 1),
    )
      .toISOString()
      .split('T')[0]
    //filter out upcoming meetings from listing
    djap.addFilter('field_date_range', formattedTomorrow, '<')
  }

  //GLOBAL SEARCH
  if (searchIndex === 'global_search') {
    //SORT
    if (sort?.relevance?.field) {
      djap.addSort(sort.relevance.field)
    }
  }

  const parsedQuery = { ...emptyQuery, ...djap.getQueryObject() }
  const hasQuery = queryHasConditions(parsedQuery)

  const serializedQuery = JSON.stringify(parsedQuery)

  const { data, error, isFetched, isFetching, isPending } = useQuery({
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await fetch(`${baseApiPath}/${searchIndex}`, {
          body: serializedQuery,
          method: 'POST',
        })
        if (!res.ok) {
          throw new Error(`An error occurred: ${res.status} ${res.statusText}`)
        }
        const json = await res.json()

        const items = deserialize(json) as DrupalNode[]

        const data: SearchEngineResults = {
          ...json,
          items: showListingOnInit || hasQuery ? items : [],
        }
        // console.log(data, ' data in search')
        return data
      } catch (error) {
        console.error('Fetch error:', error)
        throw error
      }
    },
    queryKey: [searchIndex, qs, serializedQuery, hasQuery, showListingOnInit],
    refetchInterval: 0,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })

  const currentPage = getCurrentPage(parsedQuery)

  const onChangeSort = React.useCallback(
    (field: string) => {
      // create a new instance of DrupalJsonApiParams with the current query string
      const currentQuery = new DrupalJsonApiParams(router.query.qs || '')

      // extract the current query object and manually remove the sort parameter
      const currentQueryObject = currentQuery.getQueryObject()
      delete currentQueryObject.sort

      // create a new instance of DrupalJsonApiParams with the updated query object
      const djap = new DrupalJsonApiParams()
      djap.initializeWithQueryObject(currentQueryObject)

      // add the sort parameter if field is provided
      if (field) {
        djap.addSort(field)
      }

      // get the updated query string
      const updatedQS = djap.getQueryString()
      router.push(
        {
          pathname: router.pathname,
          query: { ...router.query, qs: updatedQS },
        },
        undefined,
        {
          scroll: false,
          shallow: true,
        },
      )
    },
    [router],
  )

  const onChangeField = React.useCallback(
    (id: string, value: any) => {
      // console.log(id, value, 'changing with id value')
      const qs = applyFilter(router.query.qs || '', appConfig, id, value)

      router.push(
        {
          query: {
            ...router.query,
            qs,
            // ...(qs ? { qs } : {}),
          },
        },
        undefined,
        {
          scroll: false,
          shallow: true,
        },
      )
    },
    [router, appConfig],
  )

  const onChangeMultipleFields = React.useCallback(
    (fields: object) => {
      let updatedQS = router.query.qs || ''

      Object.entries(fields).forEach(([id, value]) => {
        updatedQS = applyFilter(updatedQS, appConfig, id, value)
      })
      router.push(
        {
          query: {
            ...router.query,
            qs: updatedQS,
          },
        },
        undefined,
        {
          scroll: false,
          shallow: true,
        },
      )
    },
    [router, appConfig],
  )

  const resetFilters = React.useCallback(() => {
    router.push(
      {
        pathname: router.pathname,
        query: {
          slug: router.query.slug,
        },
      },
      undefined,
      {
        scroll: false,
        shallow: true,
      },
    )
  }, [router])

  const onChangePage = React.useCallback(
    (page: number, pageSize?: number) => {
      const query = { ...router.query }
      delete query.slug

      const djap = new DrupalJsonApiParams(query.qs || {})
      pageSize = pageSize || appConfig.pageSize || parseInt(DEFAULT_PAGE_SIZE)
      pageSize = typeof pageSize === 'number' ? pageSize : parseInt(pageSize)
      djap.addPageLimit(pageSize)
      djap.addPageOffset((page - 1) * pageSize)

      const qs = djap.getQueryString()
      router.push(
        {
          query: {
            ...router.query,
            qs,
          },
        },
        undefined,
        {
          scroll: false,
          shallow: true,
        },
      )
    },
    [appConfig, router],
  )

  const searchText = (parsedQuery?.filter as any)?.fulltext

  return {
    currentPage,
    data: data ?? initialData,
    error,
    hasQuery,
    isFetched,
    isFetching,
    isPending,
    onChangeField,
    onChangeMultipleFields,
    onChangePage,
    onChangeSort,
    query: parsedQuery,
    resetFilters,
    searchText,
    total: data?.items?.length === 0 ? 0 : data?.meta?.count ?? 0,
  }
}
