import { largeFileInit, largeFilePartUpload, uploadSingle } from '@/api/index'
import md5 from 'js-md5'


// 文件类型，1默认不分片，2为大文件，分片上传
const FILE_TYPE = {
  DEFAULT: 1,
  LARGE_FILE: 2
}

// 分片大小：5m
const pieceSize = 5 * 1024 * 1000

/**
* 分片上传函数 支持多个文件 支持失败重传 支持同步进度百分比
* @param options
* options.files 表示文件对象
* options.progress 进度回调
*/
export const uploadByPieces = async({ files, progress }) => {
  if (!files || !files.length) return
  // 上传过程中用到的变量
  const fileList = [] // 总文件列表
  var fileIndex = 0 // 文件索引
  files.map((file, index) => {
    fileList.push({
      file, // 文件对象
      name: file.name, // 文件名
      md5: md5(file), // 文件唯一标识 uid or md5
      finishCount: 0, // 完成个数
      chunkCount: null, // 总片数
      type: /video/.test(file.type) ? FILE_TYPE.LARGE_FILE : FILE_TYPE.DEFAULT // 文件类型，默认是 video 需要分片
    })
  })
  if (fileList && fileIndex <= fileList.length - 1) {
    dealFile(fileList[fileIndex], fileIndex, fileList, progress)
  }
}

/** 
* 单个文件处理函数
* @param currentFile 表示源文件
* @param fileIndex 文件索引
* @param fileList 文件列表
* @param progress 进度回调
*/
async function dealFile(currentFile, fileIndex, fileList, progress) {
  // console.log('文件索引', fileIndex, currentFile)
  // 递归结束条件
  if (fileIndex > fileList.length - 1 || !fileList) {
    // console.log('reject')
    return 'reject'
  }
  var chunkIndex = 0 // 文件索引
  const fileSize = currentFile.file.size // 文件大小
  currentFile.chunkCount = Math.ceil(fileSize / pieceSize)// 总片数
  const fileForm = new FormData()
  fileForm.append('md5', currentFile.md5)
  if (currentFile.type === FILE_TYPE.LARGE_FILE) {
    await largeFileInit(fileForm) // 大文件上传初始化函数
    await dealChunk(currentFile, chunkIndex, progress, fileIndex) // 分片处理函数
  } else if (currentFile.type === FILE_TYPE.DEFAULT){
    const formData = new FormData()
    formData.append('file', currentFile.file)
    formData.append('md5', currentFile.md5)
    formData.append('fileType', 'DEFAULT')
    const res = await uploadSingle(formData)
    if (res.data) {
      currentFile.finishCount++
      const progressNum = Math.min(Math.ceil((currentFile.finishCount / currentFile.chunkCount) * 100), 100)
      await progress(progressNum, currentFile.name, currentFile, currentFile.type, res.data.url, res.data.filename)
    }
  }
  fileIndex++
  // 递归结束条件
  if (fileIndex > fileList.length - 1 || !fileList) {
    console.log('reject')
    return 'reject'
  }
  // 递归
  if (fileIndex <= fileList.length - 1) {
    return await dealFile(fileList[fileIndex], fileIndex, fileList, progress)
  }
}

/** 
* 针对每个文件的分片进行的处理的函数
* @param currentFile 表示源文件
* @param chunkIndex 分片索引
* @param progress 进度回调
* @param fileIndex 文件索引
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
  fetchForm.append('chunk', chunk)
  fetchForm.append('chunkMd5', md5(chunk))
  fetchForm.append('md5', currentFile.md5)
  fetchForm.append('index', chunkIndex)
  await uploadChunk(fetchForm, progress, currentFile, fileIndex)
  chunkIndex++
  if (chunkIndex > currentFile.chunkCount - 1) {
    console.log('reject')
    return 'reject'
  }
  return await dealChunk(currentFile, chunkIndex, progress, fileIndex)
}

/** 
* 针对每个分片进行的上传
* @param options
* @param progress 进度回调
* @param currentFile 表示源文件
* @param fileIndex 文件索引
* @param chunkIndex 分片索引
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

