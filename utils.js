import { largeFileInit, largeFilePartUpload, uploadSingle } from '@/api/index'

/**
* 分片上传函数 支持多个文件
* @param options
* options.file 表示源文件
* progress 进度回调
*/

// 文件类型，1为图片，不进行分片，2为视频
const FILE_TYPE = {
  IMAGE: 1,
  VIDEO: 2
}

// 分片大小：5m
const pieceSize = 5 * 1024 * 1000

/**
 * 分片上传主函数
 */
export const uploadByPieces = async({ files, progress }) => {
  if (!files || !files.length) return
  // 上传过程中用到的变量
  const fileList = [] // 总文件列表
  var fileIndex = 0 // 文件索引
  files.map((file, index) => {
    fileList.push({
      file, // 文件对象
      finishCount: 0, // 完成分片个数
      md5: file.uid, // 文件唯一标识 uid or md5
      name: file.name, // 文件名
      type: /image/.test(file.type) ? FILE_TYPE.IMAGE : FILE_TYPE.VIDEO // 文件类型
    })
  })
  if (fileList && fileIndex <= fileList.length - 1) {
    dealFile(fileList[fileIndex], fileIndex, fileList, progress)
  }
}

/** 针对每个文件进行处理
* @param options
* currentFile 表示源文件
* fileIndex 文件索引
* fileList 文件列表
* progress 进度回调
*/
async function dealFile(currentFile, fileIndex, fileList, progress) {
  // console.log('文件索引', fileIndex, currentFile)
  // 文件队列临界条件
  if (fileIndex > fileList.length - 1 || !fileList) {
    // console.log('reject')
    return 'reject'
  }
  var chunkIndex = 0 // 文件索引
  const fileSize = currentFile.file.size // 文件大小
  currentFile.chunkCount = Math.ceil(fileSize / pieceSize)// 总片数
  const fileForm = new FormData()
  fileForm.append('uuid', currentFile.md5)
  if (currentFile.type === FILE_TYPE.VIDEO) {
    await largeFileInit(fileForm)
    await dealChunk(currentFile, chunkIndex, progress, fileIndex)
  } else {
    const formData = new FormData()
    formData.append('file', currentFile.file)
    formData.append('scene', 'feed')
    formData.append('mediaType', 'image')
    const res = await uploadSingle(formData)
    if (res.data) {
      currentFile.finishCount++
      const progressNum = Math.min(Math.ceil((currentFile.finishCount / currentFile.chunkCount) * 100), 100)
      await progress(progressNum, currentFile.name, currentFile, currentFile.type, res.data.url, res.data.filename)
    }
  }
  fileIndex++
  if (fileIndex > fileList.length - 1 || !fileList) {
    console.log('reject')
    return 'reject'
  }
  if (fileIndex <= fileList.length - 1) {
    return await dealFile(fileList[fileIndex], fileIndex, fileList, progress)
  }

  // console.log(res, fileIndex)
}

/** 针对每个文件的分片进行的处理
* @param options
* currentFile 表示源文件
* chunkIndex 分片索引
* progress 进度回调
* fileIndex 文件索引
*/
async function dealChunk(currentFile, chunkIndex, progress, fileIndex) {
  // console.log('文件名', currentFile.file.name, '分片', chunkIndex, '总数', currentFile.chunkCount)
  if (chunkIndex > currentFile.chunkCount - 1) {
    // console.log('reject')
    return 'reject'
  }
  const start = chunkIndex * pieceSize
  const end = Math.min(currentFile.file.size, start + pieceSize)
  const chunk = currentFile.file.slice(start, end)
  const fetchForm = new FormData()
  fetchForm.append('uuid', currentFile.md5)
  fetchForm.append('file', chunk)
  fetchForm.append('index', chunkIndex)
  await uploadChunk(fetchForm, progress, currentFile, fileIndex)
  chunkIndex++
  if (chunkIndex > currentFile.chunkCount - 1) {
    console.log('reject')
    return 'reject'
  }
  return await dealChunk(currentFile, chunkIndex, progress, fileIndex)
}

/** 针对每个分片进行的上传
* @param options
* progress 进度回调
* currentFile 表示源文件
* fileIndex 文件索引
* chunkIndex 分片索引
*/
function uploadChunk(fetchForm, progress, currentFile, fileIndex) {
  if (currentFile && currentFile.finishCount >= currentFile.chunkCount) {
    progress(100, currentFile.name, currentFile, currentFile.type)
    return
  }
  return new Promise((resolve, reject) => {
    largeFilePartUpload(fetchForm).then((res) => {
      if (res) {
        currentFile.finishCount++
        const progressNum = Math.min(Math.ceil((currentFile.finishCount / currentFile.chunkCount) * 100), 100)
        // console.log(progressNum, fileIndex, currentFile, currentFile.type)
        progress(progressNum, currentFile.name, currentFile, currentFile.type)
        // console.log('finishCount', currentFile.finishCount)
        resolve(res)
      }
    }).catch(() => {
      // console.log(err)
      resolve()
      uploadChunk(fetchForm, progress, currentFile, fileIndex)
    })
  })
}

