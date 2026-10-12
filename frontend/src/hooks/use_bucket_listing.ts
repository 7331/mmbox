// The visitor's bucket, listed a page (100) at a time under its folder, newest first within each page. Starts over
// when the bucket settings change; `refreshBucketListing` starts over, `loadNextBucketPage` appends.
import { useCallback, useEffect, useRef, useState } from "react"

import { listBucketObjects, type BucketListingPage, type BucketObject, type BucketSettings } from "@/lib/bucket_connection"

const sortPageNewestFirst = (listingPage: BucketListingPage): BucketObject[] =>
  listingPage.objects
    .filter((listedObject) => !listedObject.key.endsWith("/"))
    .sort((leftObject, rightObject) => rightObject.lastModifiedAt.localeCompare(leftObject.lastModifiedAt))

export function useBucketListing(bucketSettings: BucketSettings | null) {
  const [listedObjects, setListedObjects] = useState<BucketObject[]>([])
  const [nextContinuationToken, setNextContinuationToken] = useState<string | null>(null)
  const [isLoadingBucketPage, setIsLoadingBucketPage] = useState(Boolean(bucketSettings))
  const [bucketListingError, setBucketListingError] = useState("")
  // Each listing run gets a number; a page that arrives after a newer run started is dropped.
  const listingRunNumber = useRef(0)

  // Another bucket (or none) starts from an empty grid, set while rendering rather than in an effect
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [listedBucketSettings, setListedBucketSettings] = useState(bucketSettings)
  if (listedBucketSettings !== bucketSettings) {
    setListedBucketSettings(bucketSettings)
    setListedObjects([])
    setNextContinuationToken(null)
    setBucketListingError("")
    setIsLoadingBucketPage(Boolean(bucketSettings))
  }

  // Lists one page and applies it, unless a newer run started meanwhile. The loading flag is set by the caller.
  const fetchAndApplyBucketPage = useCallback(
    (listedSettings: BucketSettings, continuationToken: string | null) => {
      const startOver = continuationToken === null
      if (startOver) listingRunNumber.current += 1
      const thisRunNumber = listingRunNumber.current
      return listBucketObjects(listedSettings, continuationToken)
        .then((listingPage) => {
          if (thisRunNumber !== listingRunNumber.current) return
          const pageObjects = sortPageNewestFirst(listingPage)
          setListedObjects((currentObjects) => (startOver ? pageObjects : [...currentObjects, ...pageObjects]))
          setNextContinuationToken(listingPage.nextContinuationToken)
          setBucketListingError("")
        })
        .catch((listingError: unknown) => {
          if (thisRunNumber !== listingRunNumber.current) return
          if (startOver) setListedObjects([])
          setBucketListingError(`Could not list the bucket: ${(listingError as Error).message}`)
        })
        .finally(() => {
          if (thisRunNumber === listingRunNumber.current) setIsLoadingBucketPage(false)
        })
    },
    [],
  )

  useEffect(() => {
    if (bucketSettings) void fetchAndApplyBucketPage(bucketSettings, null)
  }, [bucketSettings, fetchAndApplyBucketPage])

  const refreshBucketListing = useCallback(() => {
    if (!bucketSettings) return
    setIsLoadingBucketPage(true)
    void fetchAndApplyBucketPage(bucketSettings, null)
  }, [bucketSettings, fetchAndApplyBucketPage])

  const loadNextBucketPage = useCallback(() => {
    if (!bucketSettings || !nextContinuationToken || isLoadingBucketPage) return
    setIsLoadingBucketPage(true)
    void fetchAndApplyBucketPage(bucketSettings, nextContinuationToken)
  }, [bucketSettings, fetchAndApplyBucketPage, isLoadingBucketPage, nextContinuationToken])

  const forgetListedObject = useCallback((removedObject: BucketObject) => {
    setListedObjects((currentObjects) => currentObjects.filter((currentObject) => currentObject.key !== removedObject.key))
  }, [])

  return {
    listedObjects,
    hasMoreBucketObjects: nextContinuationToken !== null,
    isLoadingBucketPage,
    bucketListingError,
    refreshBucketListing,
    loadNextBucketPage,
    forgetListedObject,
  }
}
